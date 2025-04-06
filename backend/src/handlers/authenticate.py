"""GET /employee?objectKey=... -- decide whether a visitor photo is an employee.

Runs synchronously behind API Gateway because the caller is a person waiting
at a door: the answer is only useful in the next second or two. Indexing, by
contrast, is fire-and-forget and runs off an S3 event (see index_face).
"""

from common import config, faces, http, keys, repository
from common.logging_utils import log


def handler(event, context):
    try:
        return _handle(event)
    except http.HttpError as exc:
        log("auth.rejected", status=exc.status, reason=exc.message)
        return http.response(exc.status, {"message": exc.message})
    except Exception:
        log("auth.error", exc_info=True)
        return http.response(500, {"message": "internal error"})


def _handle(event):
    object_key = http.query_param(event, "objectKey")

    # The key must be one this API minted. Anything else is a caller trying to
    # point Rekognition at an object of their choosing.
    if not keys.is_valid_visitor_key(object_key):
        raise http.HttpError(400, "objectKey is not a valid visitor upload key")

    try:
        face_id, similarity = faces.search_face(config.VISITOR_BUCKET, object_key)
    except faces.NoFaceDetected:
        log("auth.no_face", objectKey=object_key)
        # 200, not 4xx: "there is no face in this photo" is a normal answer to
        # a well-formed question, and the frontend renders it the same way as
        # any other failed authentication.
        return http.response(
            200, {"authenticated": False, "reason": "no_face_detected"}
        )

    if not face_id:
        log("auth.no_match", objectKey=object_key, threshold=config.SIMILARITY_THRESHOLD)
        return http.response(200, {"authenticated": False, "reason": "no_match"})

    employee = repository.get_face(face_id)
    if not employee:
        # Rekognition knows this face but DynamoDB does not. Means an index
        # write failed after IndexFaces succeeded, leaving the two stores out
        # of sync. Logged distinctly because it is an operational defect, not
        # a failed login, and it is what the CloudWatch alarm watches for.
        log("auth.orphan_face", faceId=face_id, objectKey=object_key)
        return http.response(200, {"authenticated": False, "reason": "unknown_face"})

    log(
        "auth.match",
        faceId=face_id,
        employeeId=employee["employeeId"],
        similarity=round(similarity, 2),
    )
    return http.response(
        200,
        {
            "authenticated": True,
            "firstName": employee["firstName"],
            "lastName": employee["lastName"],
            "similarity": round(similarity, 2),
        },
    )
