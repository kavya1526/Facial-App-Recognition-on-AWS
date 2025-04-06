"""Object-key construction and validation.

The browser never chooses an S3 key. The presign handler mints one from a
server-side UUID, and the authenticate handler refuses any key that does not
match that exact shape. Without this check a caller could pass
`objectKey=../employees/ceo.jpg` and have Rekognition run against an image
they were never allowed to upload -- the API would happily confirm the CEO's
identity for them.
"""

import re
import uuid

VISITOR_PREFIX = "visitors/"
EMPLOYEE_PREFIX = "employees/"

_VISITOR_KEY = re.compile(
    r"^visitors/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$"
)

# Employee photos are uploaded out of band (console/CLI) and named for the
# person, e.g. employees/ada_lovelace.jpg.
_EMPLOYEE_KEY = re.compile(r"^employees/([a-z]+)_([a-z]+)\.jpg$")


def new_visitor_key():
    return f"{VISITOR_PREFIX}{uuid.uuid4()}.jpg"


def is_valid_visitor_key(key):
    return bool(key and _VISITOR_KEY.match(key))


def parse_employee_key(key):
    """Split employees/first_last.jpg into ("first", "last").

    Returns None for anything that does not match, so a stray file dropped in
    the bucket is skipped with a log line instead of indexing a face nobody
    can be identified as.
    """
    match = _EMPLOYEE_KEY.match(key)
    if not match:
        return None
    first, last = match.groups()
    return first.capitalize(), last.capitalize()
