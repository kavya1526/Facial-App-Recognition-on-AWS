import json

from common import config, repository
from handlers import authenticate

VISITOR_KEY = "visitors/8f14e45f-ceea-467a-9a36-dedd4bea2543.jpg"
FACE_ID = "1a2b3c4d-0000-4000-8000-000000000001"


def _event(object_key):
    return {"queryStringParameters": {"objectKey": object_key}}


def _search_response(face_id, similarity):
    return {
        "FaceMatches": [
            {"Similarity": similarity, "Face": {"FaceId": face_id}}
        ]
    }


def test_matches_a_known_employee(dynamodb, rekognition_stub):
    repository.put_face(
        face_id=FACE_ID,
        employee_id="ada_lovelace",
        first_name="Ada",
        last_name="Lovelace",
        source_key="employees/ada_lovelace.jpg",
    )
    rekognition_stub.add_response(
        "search_faces_by_image",
        _search_response(FACE_ID, 98.5),
        {
            "CollectionId": config.COLLECTION_ID,
            "Image": {"S3Object": {"Bucket": config.VISITOR_BUCKET, "Name": VISITOR_KEY}},
            "FaceMatchThreshold": config.SIMILARITY_THRESHOLD,
            "MaxFaces": 1,
        },
    )

    result = authenticate.handler(_event(VISITOR_KEY), None)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert body["authenticated"] is True
    assert body["firstName"] == "Ada"
    assert body["similarity"] == 98.5


def test_rejects_a_key_the_api_did_not_mint(dynamodb):
    # No Rekognition stub: reaching the service at all would fail the test,
    # which is the point -- validation must happen before we spend a call.
    result = authenticate.handler(_event("employees/ada_lovelace.jpg"), None)

    assert result["statusCode"] == 400


def test_requires_the_object_key_parameter(dynamodb):
    result = authenticate.handler({"queryStringParameters": None}, None)
    assert result["statusCode"] == 400


def test_no_match_when_the_collection_returns_nothing(dynamodb, rekognition_stub):
    rekognition_stub.add_response("search_faces_by_image", {"FaceMatches": []})

    body = json.loads(authenticate.handler(_event(VISITOR_KEY), None)["body"])

    assert body["authenticated"] is False
    assert body["reason"] == "no_match"


def test_no_match_when_similarity_is_below_threshold(dynamodb, rekognition_stub):
    # Rekognition applies the threshold too, but the local re-check is what
    # keeps the decision boundary testable, so exercise it directly.
    rekognition_stub.add_response(
        "search_faces_by_image", _search_response(FACE_ID, 71.0)
    )

    body = json.loads(authenticate.handler(_event(VISITOR_KEY), None)["body"])

    assert body["authenticated"] is False
    assert body["reason"] == "no_match"


def test_reports_a_photo_with_no_face_as_a_normal_answer(dynamodb, rekognition_stub):
    rekognition_stub.add_client_error(
        "search_faces_by_image",
        service_error_code="InvalidParameterException",
        service_message="no faces in the image",
    )

    result = authenticate.handler(_event(VISITOR_KEY), None)
    body = json.loads(result["body"])

    # 200 rather than 4xx: the frontend renders this the same as any other
    # failed authentication, and it is not a client error.
    assert result["statusCode"] == 200
    assert body["authenticated"] is False
    assert body["reason"] == "no_face_detected"


def test_denies_entry_when_rekognition_and_dynamodb_disagree(dynamodb, rekognition_stub):
    # Face is in the collection but has no row: an index write failed
    # partway. Must fail closed, and must be distinguishable from no_match.
    rekognition_stub.add_response(
        "search_faces_by_image", _search_response(FACE_ID, 99.0)
    )

    body = json.loads(authenticate.handler(_event(VISITOR_KEY), None)["body"])

    assert body["authenticated"] is False
    assert body["reason"] == "unknown_face"


def test_returns_500_without_leaking_internals(dynamodb, rekognition_stub):
    rekognition_stub.add_client_error(
        "search_faces_by_image",
        service_error_code="ProvisionedThroughputExceededException",
        service_message="slow down",
    )

    result = authenticate.handler(_event(VISITOR_KEY), None)

    assert result["statusCode"] == 500
    assert json.loads(result["body"]) == {"message": "internal error"}
