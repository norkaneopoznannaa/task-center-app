"""Structured logging configuration for Task Center"""
import logging
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }

        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # Additional context fields
        for key in ['task_id', 'user_id', 'operation', 'duration_ms', 'api_call']:
            if hasattr(record, key):
                log_data[key] = getattr(record, key)

        return json.dumps(log_data, ensure_ascii=False)


class ColoredFormatter(logging.Formatter):
    """Colored console formatter for development"""

    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logging(
    log_dir: Optional[Path] = None,
    level: int = logging.INFO,
    json_output: bool = True,
    console_output: bool = True
) -> logging.Logger:
    """
    Setup application logging

    Args:
        log_dir: Directory for log files (default: PROJECT_ROOT/logs)
        level: Logging level
        json_output: Enable JSON file logging
        console_output: Enable console logging

    Returns:
        Configured root logger
    """
    from config import Config

    if log_dir is None:
        log_dir = Config.PROJECT_ROOT / 'logs'

    log_dir.mkdir(exist_ok=True)

    # Root logger
    logger = logging.getLogger('task_center')
    logger.setLevel(level)
    logger.handlers.clear()

    # Console handler (colored for development)
    if console_output:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        console_formatter = ColoredFormatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)

    # JSON file handler (for production/analysis)
    if json_output:
        json_file = log_dir / f'task_center_{datetime.now():%Y%m%d}.log'
        file_handler = logging.FileHandler(json_file, encoding='utf-8')
        file_handler.setLevel(level)
        file_handler.setFormatter(JSONFormatter())
        logger.addHandler(file_handler)

        # Error-only file
        error_file = log_dir / f'errors_{datetime.now():%Y%m%d}.log'
        error_handler = logging.FileHandler(error_file, encoding='utf-8')
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(JSONFormatter())
        logger.addHandler(error_handler)

    return logger


def get_logger(name: str) -> logging.Logger:
    """Get a child logger with the given name"""
    return logging.getLogger(f'task_center.{name}')


# Context manager for timing operations
class LogTimer:
    """Context manager for logging operation duration"""

    def __init__(self, logger: logging.Logger, operation: str, **extra):
        self.logger = logger
        self.operation = operation
        self.extra = extra
        self.start_time = None

    def __enter__(self):
        self.start_time = datetime.now()
        self.logger.debug(f"Starting: {self.operation}", extra=self.extra)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (datetime.now() - self.start_time).total_seconds() * 1000
        extra = {**self.extra, 'duration_ms': round(duration_ms, 2), 'operation': self.operation}

        if exc_type:
            self.logger.error(
                f"Failed: {self.operation} ({duration_ms:.0f}ms)",
                exc_info=True,
                extra=extra
            )
        else:
            self.logger.info(
                f"Completed: {self.operation} ({duration_ms:.0f}ms)",
                extra=extra
            )

        return False  # Don't suppress exceptions


# Decorator for logging function calls
def log_call(logger: Optional[logging.Logger] = None):
    """Decorator to log function entry/exit with timing"""
    def decorator(func):
        nonlocal logger
        if logger is None:
            logger = get_logger(func.__module__)

        def wrapper(*args, **kwargs):
            with LogTimer(logger, func.__name__):
                return func(*args, **kwargs)

        return wrapper
    return decorator
