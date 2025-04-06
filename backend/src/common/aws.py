"""Lazily-created boto3 clients shared across warm invocations.

Clients are created on first use rather than at import so that unit tests can
install moto's mocks before any real endpoint is resolved, and so a cold start
only pays for the clients a given handler actually touches.
"""

import boto3

_clients = {}


def client(service):
    if service not in _clients:
        _clients[service] = boto3.client(service)
    return _clients[service]


def reset():
    """Drop cached clients. Used by tests between moto mock contexts."""
    _clients.clear()
