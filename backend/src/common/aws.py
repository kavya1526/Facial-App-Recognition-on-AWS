"""Lazily-created boto3 clients shared across warm invocations.

Clients are created on first use rather than at import so that unit tests can
install moto's mocks before any real endpoint is resolved, and so a cold start
only pays for the clients a given handler actually touches.
"""

import boto3
from botocore.config import Config

# S3 needs pinning to virtual-hosted addressing. Left to its own devices
# botocore resolves the legacy global host (bucket.s3.amazonaws.com) even when
# the region is set, and for a bucket outside us-east-1 S3 answers a request
# there with a 307 to the regional host. curl drops the body on that redirect
# and the browser has to re-run the CORS check against a second origin, so the
# upload fails in a way that surfaces much later as "no such key" in
# authenticate. Virtual addressing signs the regional host up front.
_CONFIGS = {
    "s3": Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
}

_clients = {}


def client(service):
    if service not in _clients:
        _clients[service] = boto3.client(service, config=_CONFIGS.get(service))
    return _clients[service]


def reset():
    """Drop cached clients. Used by tests between moto mock contexts."""
    _clients.clear()
