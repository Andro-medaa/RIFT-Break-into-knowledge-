from __future__ import annotations

from app.core.config import setting
import logging
from pathlib import Path
from typing import Any
import sys
from logging.handlers import RotatingFileHandler


LOG_DIR = Path(__file__).resolve().parents[2] / "log"
LOG_FILE = LOG_DIR / "app.log"

_STD_LOG_KEYS = frozenset(
    {
        "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
        "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
        "created", "msecs", "relativeCreated", "thread", "threadName",
        "processName", "process", "message", "taskName",
    }
)


class StructuredFormatter(logging.Formatter):
    """Structured log formatter that outputs timestamp, level, logger name,
    message, and any additional extra fields passed to logger calls.
    """

    def format(self, record: logging.LogRecord) -> str:
        # TimeStamp
        time_stamp = self.formatTime(record, "%Y-%m-%d %H:%M:%S")

        # Build base message
        message = f"{time_stamp} [{record.levelname}] {record.name} | {record.getMessage()}"

        # Append any extra fields
        extras: dict[str, Any] = {
            k: v for k, v in record.__dict__.items()
            if k not in _STD_LOG_KEYS and not k.startswith("_")
        }

        if extras:
            pairs = " | ".join(f"{k} = {v}" for k, v in extras.items())
            message = f"{message} | {pairs}"

        return message


# ---------- Logger Factory ----------------------------

_configured = False


def _configure_root() -> None:
    """Configuring both terminal and file records to their respective handlers."""
    global _configured
    if _configured:
        return

    formatter = StructuredFormatter()

    # 1. Console handler (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    # 2. File Handler (logs/app.log, rotating up to 10MB x 5 backups)
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_FILE,
            maxBytes=10 * 1024 * 1024,  # 10 MB per log File
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
    except Exception as e:
        print(f"[logging] Warning: failed to initialize file handler: {e}", file=sys.stderr)
        file_handler = None

    # 3. Configure 'app' logger
    app_logger = logging.getLogger("app")
    app_logger.setLevel(logging.DEBUG if setting.database_url == "" else logging.INFO)
    app_logger.addHandler(console_handler)
    if file_handler:
        app_logger.addHandler(file_handler)
        app_logger.propagate = False

    # 4. Also route Uvicorn server logs to the file handler
    if file_handler:
        for Uvicorn_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            u_logger = logging.getLogger(Uvicorn_name)
            u_logger.addHandler(file_handler)

    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Get a named logger under the 'app' namespace.

    Usage:
      logger = get_logger(__name__)
      logger.info("something happened", extra={"key": "value"})
    """
    _configure_root()
    return logging.getLogger(name)
