"""Конфигурация приложения Task Center"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Конфигурация приложения"""

    # API ключи
    CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
    CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5-20250929")

    # Пути
    PROJECT_ROOT = Path(__file__).parent
    DATA_DIR = PROJECT_ROOT / "data"
    DOCS_DIR = PROJECT_ROOT / "project_docs"
    CACHE_DIR = DATA_DIR / "cache"

    # Настройки AI
    AI_TEMPERATURE = float(os.getenv("AI_TEMPERATURE", "0.7"))
    AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "4096"))
    AI_BATCH_SIZE = int(os.getenv("AI_BATCH_SIZE", "20"))

    # Настройки приоритизации
    DEFAULT_AVAILABLE_HOURS = float(os.getenv("DEFAULT_AVAILABLE_HOURS", "8.0"))
    MAX_RECOMMENDED_TASKS = int(os.getenv("MAX_RECOMMENDED_TASKS", "5"))

    # Настройки контекстного поиска
    MAX_CONTEXT_LENGTH = int(os.getenv("MAX_CONTEXT_LENGTH", "3000"))
    MIN_KEYWORD_LENGTH = int(os.getenv("MIN_KEYWORD_LENGTH", "3"))

    @classmethod
    def validate(cls):
        """Валидация конфигурации"""
        if not cls.CLAUDE_API_KEY:
            raise ValueError(
                "CLAUDE_API_KEY не установлен. "
                "Создайте файл .env на основе .env.example и добавьте ваш API ключ."
            )

        # Создание необходимых директорий
        cls.DATA_DIR.mkdir(exist_ok=True)
        cls.CACHE_DIR.mkdir(exist_ok=True)
        cls.DOCS_DIR.mkdir(exist_ok=True)

    @classmethod
    def get_tasks_file(cls) -> Path:
        """Путь к файлу с задачами"""
        return cls.DATA_DIR / "tasks.json"

    @classmethod
    def get_history_file(cls) -> Path:
        """Путь к файлу истории"""
        return cls.DATA_DIR / "history.json"

    @classmethod
    def get_metadata_file(cls) -> Path:
        """Путь к файлу метаданных"""
        return cls.DATA_DIR / "metadata.json"
