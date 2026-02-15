"""Data модели для Task Center с Pydantic валидацией"""
from enum import Enum
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4
from pydantic import BaseModel, Field, validator, field_validator, ConfigDict


class TaskType(Enum):
    """Типы задач"""
    ANALYSIS = "Анализ/Исследование"
    DOCUMENTATION = "Документация"
    DEVELOPMENT = "Разработка"
    COORDINATION = "Координация"
    BUG = "Баг/Проблема"
    UNKNOWN = "Неизвестно"


class Complexity(Enum):
    """Сложность выполнения"""
    LOW = "низкая"
    MEDIUM = "средняя"
    HIGH = "высокая"


class Priority(Enum):
    """Приоритет задачи"""
    CRITICAL = 5  # Критично
    HIGH = 4      # Высокий
    MEDIUM = 3    # Средний
    LOW = 2       # Низкий
    BACKLOG = 1   # Бэклог


class Status(Enum):
    """Статус выполнения"""
    NEW = "новая"
    IN_PROGRESS = "в работе"
    BLOCKED = "заблокирована"
    REVIEW = "на проверке"
    DONE = "завершена"
    CANCELLED = "отменена"


class JiraReference(BaseModel):
    """Ссылка на Jira с валидацией"""
    model_config = ConfigDict(validate_assignment=True)

    ticket_id: str = Field(..., min_length=3, max_length=20, pattern=r'^[A-Z][A-Z0-9]+-\d+$')
    url: Optional[str] = Field(None, pattern=r'^https?://')  # Полная ссылка
    project: str = Field(default="REMD", min_length=1, max_length=20)

    @field_validator('url')
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v and not v.startswith(('http://', 'https://')):
            raise ValueError('URL must start with http:// or https://')
        return v

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(exclude_none=True)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'JiraReference':
        return cls(**data)


class Person(BaseModel):
    """Упоминание человека с валидацией"""
    model_config = ConfigDict(validate_assignment=True)

    name: str = Field(..., min_length=1, max_length=100)
    role: Optional[str] = Field(None, max_length=100)  # Роль в задаче
    mention_context: Optional[str] = Field(None, max_length=500)  # Контекст упоминания

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(exclude_none=True)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Person':
        return cls(**data)


class TaskContext(BaseModel):
    """Контекст из документации с валидацией"""
    model_config = ConfigDict(validate_assignment=True)

    relevant_docs: List[str] = Field(default_factory=list)  # Пути к релевантным документам
    key_terms: List[str] = Field(default_factory=list)      # Ключевые термины
    related_systems: List[str] = Field(default_factory=list)  # Связанные системы
    criticality_factors: Dict[str, Any] = Field(default_factory=dict)  # Факторы критичности

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(exclude_defaults=True)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskContext':
        return cls(**data)


class TaskMetadata(BaseModel):
    """Метаданные задачи с валидацией"""
    model_config = ConfigDict(validate_assignment=True)

    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    last_status_change: Optional[datetime] = None
    estimated_hours: Optional[float] = Field(None, ge=0, le=16)
    actual_hours: Optional[float] = Field(None, ge=0, le=160)
    tags: List[str] = Field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(mode='json', exclude_none=False)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskMetadata':
        return cls(**data)


class Task(BaseModel):
    """Основная модель задачи с полной валидацией Pydantic"""
    model_config = ConfigDict(validate_assignment=True, use_enum_values=False)

    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1)

    # Основная информация
    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=5000)
    original_text: str = Field(default="")  # Исходный текст от пользователя

    # Классификация
    task_type: TaskType = Field(default=TaskType.UNKNOWN)
    complexity: Complexity = Field(default=Complexity.MEDIUM)
    priority: Priority = Field(default=Priority.MEDIUM)
    status: Status = Field(default=Status.NEW)

    # Связи и ссылки
    jira_references: List[JiraReference] = Field(default_factory=list)
    mentions: List[Person] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)  # IDs зависимых задач

    # Временные метки
    deadline: Optional[datetime] = None
    start_date: Optional[datetime] = None

    # Контекст
    context: TaskContext = Field(default_factory=TaskContext)
    metadata: TaskMetadata = Field(default_factory=TaskMetadata)

    # AI-генерированные поля
    ai_classification_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    ai_recommendations: Dict[str, Any] = Field(default_factory=dict)

    # Пользовательские данные
    user_notes: str = Field(default="", max_length=5000)
    clarifications: Dict[str, str] = Field(default_factory=dict)  # Вопрос -> Ответ

    @field_validator('title')
    @classmethod
    def validate_title_not_empty(cls, v: str) -> str:
        if v and not v.strip():
            raise ValueError('Title cannot be only whitespace')
        return v.strip() if v else v

    def to_dict(self) -> Dict[str, Any]:
        """Сериализация в словарь для JSON"""
        data = self.model_dump(mode='json', by_alias=False)
        # Ensure enums are serialized properly
        data['task_type'] = self.task_type.value
        data['complexity'] = self.complexity.value
        data['priority'] = self.priority.value
        data['status'] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Task':
        """Десериализация из словаря"""
        # Normalize priority field (can be name or value)
        if 'priority' in data and isinstance(data['priority'], str):
            try:
                # Try to parse as enum name first
                data['priority'] = Priority[data['priority']]
            except KeyError:
                # Try to find by value
                for p in Priority:
                    if p.value == data['priority']:
                        data['priority'] = p
                        break
        return cls(**data)

    def __str__(self) -> str:
        """Строковое представление"""
        return f"[{self.id[:8]}] {self.title} ({self.status.value})"


class TaskHistory(BaseModel):
    """История изменений задачи с валидацией"""
    model_config = ConfigDict(validate_assignment=True)

    task_id: str = Field(..., min_length=1)
    timestamp: datetime = Field(default_factory=datetime.now)
    action: str = Field(..., min_length=1, max_length=50)  # create, update, status_change, priority_change
    changes: Dict[str, Any] = Field(...)  # Что изменилось
    user_comment: Optional[str] = Field(None, max_length=1000)

    @field_validator('action')
    @classmethod
    def validate_action(cls, v: str) -> str:
        allowed_actions = {'create', 'update', 'status_change', 'priority_change', 'delete', 'note_add'}
        if v not in allowed_actions:
            raise ValueError(f'Action must be one of {allowed_actions}')
        return v

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(mode='json', exclude_none=False)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskHistory':
        return cls(**data)
