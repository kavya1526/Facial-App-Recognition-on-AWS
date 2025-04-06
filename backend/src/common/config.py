"""Environment configuration, read once per cold start.

Every value is injected by CloudFormation (see template.yaml) rather than
hardcoded, so the same artifact deploys to dev and prod unchanged.
"""

import os


def _require(name):
    """Fail fast at import time if the stack wired the function up wrong.

    A missing variable is a deploy bug, not a request bug -- surfacing it on
    the cold start makes it show up in the first invocation's logs instead of
    as a confusing KeyError deep inside a handler.
    """
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


VISITOR_BUCKET = _require("VISITOR_BUCKET")
EMPLOYEE_BUCKET = _require("EMPLOYEE_BUCKET")
COLLECTION_ID = _require("REKOGNITION_COLLECTION_ID")
EMPLOYEE_TABLE = _require("EMPLOYEE_TABLE")

# Rekognition returns matches ranked by similarity; anything below this is
# treated as no match. 90 is deliberately conservative: see README's
# "Choosing the similarity threshold" for the FAR/FRR tradeoff.
SIMILARITY_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", "90"))

# Presigned PUT URLs are single-use in practice because the key embeds a
# UUID, so a short expiry costs nothing and shrinks the replay window.
PRESIGNED_URL_TTL_SECONDS = int(os.environ.get("PRESIGNED_URL_TTL_SECONDS", "60"))

# Rejected at presign time so oversized uploads never reach S3 or Rekognition.
# Rekognition's own limit for S3-backed images is 15 MB.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
