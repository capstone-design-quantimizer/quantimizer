from __future__ import annotations

import json
import logging
import sys
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
                "ts": self.formatTime(record, self.datefmt),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
                "path": record.pathname,
                "line": record.lineno,
                "process": record.process,
                "thread": record.threadName,
            }
            for k, v in record.__dict__.items():
                if k not in base and k not in ("args", "msg", "message", "exc_text", "exc_info", "stack_info"):
                    try:
                        json.dumps(v)
                        base[k] = v
                    except Exception:
                        base[k] = str(v)
            return json.dumps(base, ensure_ascii=False)

    return _Fallback()


def configure_logging(service_name: str, level: str | int = "INFO") -> None:
    if isinstance(level, str):
        level = getattr(logging, level.upper(), logging.INFO)

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

    class _ServiceTagFilter(logging.Filter):
        def __init__(self, service: str) -> None:
            super().__init__()
            self._service = service

        def filter(self, record: logging.LogRecord) -> bool:
            if not hasattr(record, "service"):
                setattr(record, "service", self._service)
            return True

    root.addFilter(_ServiceTagFilter(service_name))
