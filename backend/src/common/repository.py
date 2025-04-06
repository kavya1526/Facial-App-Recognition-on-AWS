"""DynamoDB access for the employee face index.

Table layout (single table, partition key only -- no sort key, no GSI):

    FaceId (PK, S)   Rekognition's opaque face identifier
    EmployeeId (S)   our identifier, derived from the uploaded object key
    FirstName  (S)
    LastName   (S)
    SourceKey  (S)   the S3 key the face was indexed from
    IndexedAt  (S)   ISO-8601 UTC timestamp

The access pattern is a single point lookup by FaceId: Rekognition's
SearchFacesByImage hands back a FaceId and we need the human behind it. A
partition-key GetItem is the cheapest possible read for that (1 RCU, no
scan), which is why there is no sort key and no secondary index. Adding
"list all employees" later would need a GSI or a Scan -- called out in the
README as a known limitation rather than pre-built for a use case we do not
have.
"""

from datetime import datetime, timezone

from . import aws, config


def _table():
    return aws.client("dynamodb")


def put_face(face_id, employee_id, first_name, last_name, source_key):
    """Record the mapping from a Rekognition FaceId to an employee.

    Uses a conditional write so that replaying the same S3 event -- which
    S3 -> Lambda notifications explicitly allow, since delivery is
    at-least-once -- does not silently overwrite an existing row. The caller
    treats the conditional failure as success.
    """
    _table().put_item(
        TableName=config.EMPLOYEE_TABLE,
        Item={
            "FaceId": {"S": face_id},
            "EmployeeId": {"S": employee_id},
            "FirstName": {"S": first_name},
            "LastName": {"S": last_name},
            "SourceKey": {"S": source_key},
            "IndexedAt": {"S": datetime.now(timezone.utc).isoformat()},
        },
        ConditionExpression="attribute_not_exists(FaceId)",
    )


def get_face(face_id):
    """Return the employee record for a FaceId, or None if unknown.

    A miss here is not necessarily a bug: it means Rekognition matched a face
    that is in the collection but not in our table, which happens if an index
    write failed after IndexFaces succeeded. The authenticate handler logs it
    as a distinct event so the two can be told apart in CloudWatch.
    """
    result = _table().get_item(
        TableName=config.EMPLOYEE_TABLE,
        Key={"FaceId": {"S": face_id}},
        ConsistentRead=True,
    )
    item = result.get("Item")
    if not item:
        return None
    return {
        "faceId": item["FaceId"]["S"],
        "employeeId": item["EmployeeId"]["S"],
        "firstName": item["FirstName"]["S"],
        "lastName": item["LastName"]["S"],
    }
