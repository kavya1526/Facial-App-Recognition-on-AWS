"""S3 ObjectCreated on the employee bucket -- add a face to the collection.

Asynchronous by design. Enrolling an employee is not something anyone waits
on, so it runs off an S3 notification rather than an API call: uploads that
arrive in a burst are absorbed by Lambda's concurrency instead of timing out
a request, and a Rekognition throttle just means the event is retried.

Failure handling relies on that asynchrony. Lambda retries an async
invocation twice, then sends the event to the DLQ declared in template.yaml.
So this handler raises on anything transient (throttles, DynamoDB
unavailability) to buy those retries, and swallows anything permanent (no
face in the photo, unparseable key) because retrying will never help.
"""

import urllib.parse

from botocore.exceptions import ClientError

from common import faces, keys, repository
from common.logging_utils import log


def handler(event, context):
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        # S3 URL-encodes the key in the event payload, so "ada lovelace.jpg"
        # arrives as "ada+lovelace.jpg" and would 404 if used as-is.
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        _index_one(bucket, key)


def _index_one(bucket, key):
    name = keys.parse_employee_key(key)
    if not name:
        log("index.skipped_key", objectKey=key, reason="does_not_match_naming_scheme")
        return

    first_name, last_name = name
    employee_id = key.removeprefix(keys.EMPLOYEE_PREFIX).removesuffix(".jpg")

    try:
        face_id = faces.index_face(bucket, key, external_image_id=employee_id)
    except faces.NoFaceDetected:
        # Permanent: the photo will not grow a face on retry. Log and drop, so
        # the event never reaches the DLQ and nobody pages on a bad headshot.
        log("index.no_face", objectKey=key)
        return

    try:
        repository.put_face(
            face_id=face_id,
            employee_id=employee_id,
            first_name=first_name,
            last_name=last_name,
            source_key=key,
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # S3 notifications are at-least-once, so a duplicate delivery is
            # expected rather than exceptional. The row already exists and is
            # identical; treat the replay as a no-op.
            log("index.duplicate", faceId=face_id, objectKey=key)
            return
        raise

    log("index.indexed", faceId=face_id, employeeId=employee_id, objectKey=key)
