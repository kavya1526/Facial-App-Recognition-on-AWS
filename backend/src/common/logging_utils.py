"""Structured JSON logging.

CloudWatch Logs Insights can query JSON log lines by field, so every log
record is emitted as a single JSON object rather than free text. That makes
queries like `fields @timestamp, similarity | filter event = "auth.no_match"`
possible without regex parsing.
"""

import json
import logging
import os
import traceback

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


def log(event, exc_info=False, **fields):
    """Emit one structured log line.

    `event` is a dotted name (e.g. "auth.match") used as the primary filter
    key. Remaining keyword arguments are merged into the same JSON object.

    Passing exc_info=True folds the active traceback into the same object
    instead of letting Python print it as a separate multi-line record --
    CloudWatch would otherwise split it across log events and break the
    one-line-one-JSON-object contract that Insights queries rely on.
    """
    record = {"event": event, **fields}
    if exc_info:
        record["error"] = traceback.format_exc()
        logger.error(json.dumps(record, default=str))
    else:
        logger.info(json.dumps(record, default=str))
