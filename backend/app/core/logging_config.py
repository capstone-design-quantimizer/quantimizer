from __future__ import annotations

import json
import logging
import sys
import os
from typing import Any, Dict

try:
    from pythonjsonlogger import jsonlogger  
    HAS_JSON = True
except Exception:
    HAS_JSON = False


def _build_json_formatter() -> logging.Formatter:
    if HAS_JSON:
        return jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s %(pathname)s %(lineno)d %(process)d %(threadName)s",
            rename_fields={"levelname": "level", "name": "logger", "message": "msg"},
        )

    class _Fallback(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            base: Dict[str, Any] = {
                "ts": getattr(record, "asctime", None),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
                "path": record.pathname,
                "line": record.lineno,
                "process": record.process,
                "thread": record.threadName,
            }
            for k, v in record.__dict__.items():
                if k in ("args", "msg", "message", "exc_text", "exc_info", "stack_info"):
                    continue
                if k not in base:
                    try:
                        json.dumps(v)
                        base[k] = v
                    except Exception:
                        base[k] = str(v)
            return json.dumps(base, ensure_ascii=False)

    return _Fallback()


def setup_logging() -> None:
    service_name = os.getenv("SERVICE_NAME", "app")
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(_build_json_formatter())
    root.addHandler(handler)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "gunicorn", "gunicorn.error"):
        lg = logging.getLogger(name)
        lg.propagate = True
        lg.handlers = []
        lg.setLevel(level)

    class _ServiceTag(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            if not hasattr(record, "service"):
                setattr(record, "service", service_name)
            return True

    root.addFilter(_ServiceTag())
