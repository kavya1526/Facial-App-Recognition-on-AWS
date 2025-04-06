"""API Gateway (REST, Lambda proxy integration) request/response helpers.

Handlers return plain dicts; this module owns the proxy-integration envelope
so that CORS headers and error shapes stay identical across every endpoint.
"""

import json

from . import config


class HttpError(Exception):
    """Raised by handlers to return a specific status without a traceback.

    Anything else that escapes a handler becomes a 500 with a generic body,
    so internal details (bucket names, stack traces) never reach the client.
    """

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            # Locked to the deployed frontend origin rather than "*" so a
            # hostile page can't drive the API with a victim's credentials
            # once Cognito auth is added.
            "Access-Control-Allow-Origin": config.ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body, default=str),
    }


def query_param(event, name, required=True):
    params = event.get("queryStringParameters") or {}
    value = params.get(name)
    if required and not value:
        raise HttpError(400, f"missing required query parameter: {name}")
    return value


def json_body(event):
    try:
        return json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        raise HttpError(400, "request body must be valid JSON")
