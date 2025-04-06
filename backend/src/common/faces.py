"""Rekognition operations, wrapped so handlers deal in plain dicts.

Two calls carry the whole product:

  IndexFaces          -- extract a face vector from an employee photo and
                         store it in a server-side collection.
  SearchFacesByImage  -- extract a vector from a visitor photo and return the
                         nearest neighbours already in that collection.

Rekognition owns the vectors; we never see or store them. That keeps the
biometric template out of our datastore, which matters for BIPA/GDPR-style
obligations, and means our DynamoDB table holds only an opaque FaceId.
"""

from . import aws, config


class NoFaceDetected(Exception):
    """The uploaded image contained no detectable face."""


def index_face(bucket, key, external_image_id):
    """Index the single largest face in an image; return its FaceId.

    MaxFaces=1 with QualityFilter=AUTO means a group photo indexes only the
    dominant face and blurry/tiny faces are dropped outright. Both are
    deliberate: an employee headshot should contain exactly one usable face,
    and silently indexing a bystander would let them authenticate later.
    """
    result = aws.client("rekognition").index_faces(
        CollectionId=config.COLLECTION_ID,
        Image={"S3Object": {"Bucket": bucket, "Name": key}},
        ExternalImageId=external_image_id,
        MaxFaces=1,
        QualityFilter="AUTO",
        DetectionAttributes=[],
    )
    records = result.get("FaceRecords") or []
    if not records:
        raise NoFaceDetected(f"no face passed the quality filter in {key}")
    return records[0]["Face"]["FaceId"]


def search_face(bucket, key):
    """Find the best match for a visitor image.

    Returns (face_id, similarity) or (None, None) when nothing clears the
    threshold. Rekognition applies FaceMatchThreshold itself, but we pass
    MaxFaces=1 and re-check the score locally so the decision boundary lives
    in our code and is unit-testable without calling AWS.
    """
    try:
        result = aws.client("rekognition").search_faces_by_image(
            CollectionId=config.COLLECTION_ID,
            Image={"S3Object": {"Bucket": bucket, "Name": key}},
            FaceMatchThreshold=config.SIMILARITY_THRESHOLD,
            MaxFaces=1,
        )
    except aws.client("rekognition").exceptions.InvalidParameterException:
        # Rekognition raises this rather than returning an empty list when the
        # image has no face at all -- a common case for a webcam upload, so it
        # is a normal outcome here, not an error.
        raise NoFaceDetected(f"no face detected in {key}")

    matches = result.get("FaceMatches") or []
    if not matches:
        return None, None

    best = matches[0]
    similarity = best["Similarity"]
    if similarity < config.SIMILARITY_THRESHOLD:
        return None, None
    return best["Face"]["FaceId"], similarity
