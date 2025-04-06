"""Shared fixtures.

The environment has to be populated before any handler module is imported,
because common.config reads it at import time and raises on anything missing.
An autouse session fixture would still run too late -- pytest imports the test
modules (and therefore the handlers) during collection -- so the variables are
set at module scope here instead. conftest.py is always imported first.
"""

import os

import boto3
import pytest
from botocore.stub import Stubber

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-2")
os.environ.setdefault("VISITOR_BUCKET", "test-visitors")
os.environ.setdefault("EMPLOYEE_BUCKET", "test-employees")
os.environ.setdefault("REKOGNITION_COLLECTION_ID", "test-collection")
os.environ.setdefault("EMPLOYEE_TABLE", "test-employees-table")
os.environ.setdefault("SIMILARITY_THRESHOLD", "90")
os.environ.setdefault("ALLOWED_ORIGIN", "https://example.test")

# Never let a test reach a real account, even if the developer has live
# credentials exported (which the deploy step requires).
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")

from common import aws, config  # noqa: E402  (must follow the env setup above)


@pytest.fixture(autouse=True)
def _reset_clients():
    """Clear cached boto3 clients between tests.

    common.aws memoises clients to reuse them across warm invocations. In
    tests that would leak a client created inside one moto mock into the next
    test, where the mock is no longer active.
    """
    aws.reset()
    yield
    aws.reset()


@pytest.fixture
def s3(aws_mocks):
    client = boto3.client("s3", region_name="us-east-2")
    for bucket in (config.VISITOR_BUCKET, config.EMPLOYEE_BUCKET):
        client.create_bucket(
            Bucket=bucket,
            CreateBucketConfiguration={"LocationConstraint": "us-east-2"},
        )
    return client


@pytest.fixture
def dynamodb(aws_mocks):
    client = boto3.client("dynamodb", region_name="us-east-2")
    client.create_table(
        TableName=config.EMPLOYEE_TABLE,
        AttributeDefinitions=[{"AttributeName": "FaceId", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "FaceId", "KeyType": "HASH"}],
        BillingMode="PAY_PER_REQUEST",
    )
    return client


@pytest.fixture
def aws_mocks():
    from moto import mock_aws

    with mock_aws():
        yield


@pytest.fixture
def rekognition_stub():
    """Stub Rekognition responses.

    moto does not implement IndexFaces or SearchFacesByImage, so these are
    driven with botocore's Stubber instead. That is arguably the better tool
    here anyway: it validates the request parameters against the real service
    model, so a typo'd argument name fails the test rather than being
    silently accepted by a mock.
    """
    client = boto3.client("rekognition", region_name="us-east-2")
    stubber = Stubber(client)
    stubber.activate()
    # Hand the stubbed client to the code under test through the same cache
    # the handlers read from.
    aws._clients["rekognition"] = client
    yield stubber
    stubber.deactivate()
