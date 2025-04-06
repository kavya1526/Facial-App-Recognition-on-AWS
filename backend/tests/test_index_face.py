import pytest

from common import config, repository
from handlers import index_face

FACE_ID = "1a2b3c4d-0000-4000-8000-000000000009"


def _s3_event(key, bucket=None):
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": bucket or config.EMPLOYEE_BUCKET},
                    "object": {"key": key},
                }
            }
        ]
    }


def _index_response(face_id):
    return {"FaceRecords": [{"Face": {"FaceId": face_id}}]}


def test_indexes_a_face_and_stores_the_mapping(dynamodb, rekognition_stub):
    rekognition_stub.add_response(
        "index_faces",
        _index_response(FACE_ID),
        {
            "CollectionId": config.COLLECTION_ID,
            "Image": {
                "S3Object": {
                    "Bucket": config.EMPLOYEE_BUCKET,
                    "Name": "employees/ada_lovelace.jpg",
                }
            },
            "ExternalImageId": "ada_lovelace",
            "MaxFaces": 1,
            "QualityFilter": "AUTO",
            "DetectionAttributes": [],
        },
    )

    index_face.handler(_s3_event("employees/ada_lovelace.jpg"), None)

    stored = repository.get_face(FACE_ID)
    assert stored["firstName"] == "Ada"
    assert stored["lastName"] == "Lovelace"
    assert stored["employeeId"] == "ada_lovelace"


def test_decodes_the_url_encoded_key_from_the_event(dynamodb, rekognition_stub):
    # S3 percent-encodes the object key inside the notification payload, so
    # the handler has to decode before handing it to Rekognition -- otherwise
    # it asks for an object that does not exist and gets an opaque 404. The
    # stub asserts the decoded form, so dropping the unquote_plus call fails
    # here rather than silently in production.
    rekognition_stub.add_response(
        "index_faces",
        _index_response(FACE_ID),
        {
            "CollectionId": config.COLLECTION_ID,
            "Image": {
                "S3Object": {
                    "Bucket": config.EMPLOYEE_BUCKET,
                    "Name": "employees/ada_lovelace.jpg",
                }
            },
            "ExternalImageId": "ada_lovelace",
            "MaxFaces": 1,
            "QualityFilter": "AUTO",
            "DetectionAttributes": [],
        },
    )

    index_face.handler(_s3_event("employees/ada%5Flovelace.jpg"), None)

    assert repository.get_face(FACE_ID) is not None


def test_key_that_decodes_to_a_space_is_skipped(dynamodb):
    # "ada+lovelace.jpg" decodes to "ada lovelace.jpg", which is not the
    # first_last.jpg convention. No Rekognition stub, so any call fails the
    # test: a badly named upload must cost nothing.
    index_face.handler(_s3_event("employees/ada+lovelace.jpg"), None)

    assert repository.get_face(FACE_ID) is None


def test_replayed_event_is_a_no_op(dynamodb, rekognition_stub):
    # S3 notification delivery is at-least-once, so the same object can arrive
    # twice. The second pass must not raise -- raising would send a perfectly
    # healthy event to the DLQ and fire the alarm.
    for _ in range(2):
        rekognition_stub.add_response("index_faces", _index_response(FACE_ID))

    index_face.handler(_s3_event("employees/ada_lovelace.jpg"), None)
    index_face.handler(_s3_event("employees/ada_lovelace.jpg"), None)

    assert repository.get_face(FACE_ID)["employeeId"] == "ada_lovelace"


def test_photo_without_a_face_is_dropped_not_retried(dynamodb, rekognition_stub):
    # Permanent failure: retrying costs three Rekognition calls and ends in
    # the DLQ for something no operator can fix.
    rekognition_stub.add_response("index_faces", {"FaceRecords": []})

    index_face.handler(_s3_event("employees/ada_lovelace.jpg"), None)

    assert repository.get_face(FACE_ID) is None


def test_file_not_matching_the_naming_scheme_is_skipped(dynamodb):
    # No Rekognition stub -- a call would fail the test. Nothing should be
    # spent on a stray file dropped into the bucket.
    index_face.handler(_s3_event("employees/notes.jpg"), None)

    assert repository.get_face(FACE_ID) is None


def test_transient_dynamodb_failure_propagates_for_retry(rekognition_stub):
    # No dynamodb fixture, so the table does not exist. The handler must let
    # this escape: Lambda's async retries plus the DLQ are the recovery path,
    # and swallowing it would silently lose an employee's enrolment.
    rekognition_stub.add_response("index_faces", _index_response(FACE_ID))

    with pytest.raises(Exception):
        index_face.handler(_s3_event("employees/ada_lovelace.jpg"), None)


def test_processes_every_record_in_a_batched_event(dynamodb, rekognition_stub):
    second_face = "1a2b3c4d-0000-4000-8000-000000000010"
    rekognition_stub.add_response("index_faces", _index_response(FACE_ID))
    rekognition_stub.add_response("index_faces", _index_response(second_face))

    event = _s3_event("employees/ada_lovelace.jpg")
    event["Records"].append(
        {
            "s3": {
                "bucket": {"name": config.EMPLOYEE_BUCKET},
                "object": {"key": "employees/grace_hopper.jpg"},
            }
        }
    )

    index_face.handler(event, None)

    assert repository.get_face(FACE_ID)["employeeId"] == "ada_lovelace"
    assert repository.get_face(second_face)["employeeId"] == "grace_hopper"
