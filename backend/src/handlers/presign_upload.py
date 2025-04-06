"""POST /uploads -- mint a short-lived, single-key S3 upload credential.

Replaces the original design, where API Gateway proxied the image bytes
straight into S3 with no authentication. That version had three problems:
anyone who found the URL could write arbitrary objects into the bucket, the
proxy integration capped uploads at API Gateway's 10 MB request limit, and
every byte was billed twice (API Gateway data transfer plus S3 PUT).

Here the browser asks for permission first, gets back a policy scoped to one
server-chosen key, and uploads directly to S3.
"""

from common import aws, config, http, keys
from common.logging_utils import log

# JPEG only: Rekognition accepts JPEG and PNG, but pinning a single type keeps
# the presigned policy exact, and every browser can produce JPEG from a canvas.
ALLOWED_CONTENT_TYPE = "image/jpeg"


def handler(event, context):
    try:
        return _handle(event)
    except http.HttpError as exc:
        log("presign.rejected", status=exc.status, reason=exc.message)
        return http.response(exc.status, {"message": exc.message})
    except Exception:
        log("presign.error", exc_info=True)
        return http.response(500, {"message": "internal error"})


def _handle(event):
    body = http.json_body(event)
    content_type = body.get("contentType", ALLOWED_CONTENT_TYPE)
    if content_type != ALLOWED_CONTENT_TYPE:
        raise http.HttpError(400, f"contentType must be {ALLOWED_CONTENT_TYPE}")

    object_key = keys.new_visitor_key()

    # generate_presigned_post rather than presigned PUT: a POST policy can
    # carry a content-length-range condition, which S3 enforces server-side.
    # A presigned PUT cannot express a size limit at all, so a caller could
    # upload a multi-gigabyte object and we would only find out when the
    # storage bill arrived.
    presigned = aws.client("s3").generate_presigned_post(
        Bucket=config.VISITOR_BUCKET,
        Key=object_key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, config.MAX_UPLOAD_BYTES],
        ],
        ExpiresIn=config.PRESIGNED_URL_TTL_SECONDS,
    )

    log("presign.issued", objectKey=object_key, ttl=config.PRESIGNED_URL_TTL_SECONDS)
    return http.response(
        200,
        {
            "uploadUrl": presigned["url"],
            "fields": presigned["fields"],
            "objectKey": object_key,
            "maxBytes": config.MAX_UPLOAD_BYTES,
        },
    )
