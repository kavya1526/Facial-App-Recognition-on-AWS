import json

from common import config, keys
from handlers import presign_upload


def _event(body):
    return {"body": json.dumps(body) if body is not None else None}


def test_issues_a_policy_for_a_server_chosen_key(s3):
    result = presign_upload.handler(_event({"contentType": "image/jpeg"}), None)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])

    # The client never supplies the key -- that is what stops it overwriting
    # someone else's upload or writing outside the visitors/ prefix.
    assert keys.is_valid_visitor_key(body["objectKey"])
    assert body["fields"]["key"] == body["objectKey"]


def test_policy_caps_the_upload_size(s3):
    result = presign_upload.handler(_event({}), None)
    body = json.loads(result["body"])

    # S3 enforces this server-side from the signed policy, so a client that
    # ignores maxBytes still cannot store a huge object.
    policy = json.loads(
        __import__("base64").b64decode(body["fields"]["policy"]).decode()
    )
    assert ["content-length-range", 1, config.MAX_UPLOAD_BYTES] in policy["conditions"]


def test_defaults_to_jpeg_when_content_type_is_omitted(s3):
    result = presign_upload.handler(_event({}), None)
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["fields"]["Content-Type"] == "image/jpeg"


def test_rejects_a_content_type_rekognition_cannot_read(s3):
    result = presign_upload.handler(_event({"contentType": "application/zip"}), None)

    assert result["statusCode"] == 400
    assert "image/jpeg" in json.loads(result["body"])["message"]


def test_rejects_malformed_json(s3):
    result = presign_upload.handler({"body": "{not json"}, None)
    assert result["statusCode"] == 400


def test_response_carries_the_configured_cors_origin(s3):
    result = presign_upload.handler(_event({}), None)
    assert result["headers"]["Access-Control-Allow-Origin"] == config.ALLOWED_ORIGIN
    assert result["headers"]["Access-Control-Allow-Origin"] != "*"
