"""Data модели для Task Center"""
from enum import Enum
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4
import json


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


@dataclass
class JiraReference:
    """Ссылка на Jira"""
    ticket_id: str              # Например: EGISZREMD-15263
    url: Optional[str] = None   # Полная ссылка
    project: str = "REMD"       # Проект по умолчанию

    def to_dict(self) -> Dict[str, Any]:
        return {
            'ticket_id': self.ticket_id,
            'url': self.url,
            'project': self.project
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'JiraReference':
        return cls(
            ticket_id=data['ticket_id'],
            url=data.get('url'),
            project=data.get('project', 'REMD')
        )


@dataclass
class Person:
    """Упоминание человека"""
    name: str
    role: Optional[str] = None  # Роль в задаче (исполнитель, согласующий)
    mention_context: Optional[str] = None  # Контекст упоминания

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'role': self.role,
            'mention_context': self.mention_context
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Person':
        return cls(
            name=data['name'],
            role=data.get('role'),
            mention_context=data.get('mention_context')
        )


@dataclass
class TaskContext:
    """Контекст из документации"""
    relevant_docs: List[str] = field(default_factory=list)  # Пути к релевантным документам
    key_terms: List[str] = field(default_factory=list)      # Ключевые термины (ФЛК, СЭМД, etc)
    related_systems: List[str] = field(default_factory=list)  # Связанные системы
    criticality_factors: Dict[str, Any] = field(default_factory=dict)  # Факторы критичности

    def to_dict(self) -> Dict[str, Any]:
        return {
            'relevant_docs': self.relevant_docs,
            'key_terms': self.key_terms,
            'related_systems': self.related_systems,
            'criticality_factors': self.criticality_factors
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskContext':
        return cls(
            relevant_docs=data.get('relevant_docs', []),
            key_terms=data.get('key_terms', []),
            related_systems=data.get('related_systems', []),
            criticality_factors=data.get('criticality_factors', {})
        )


@dataclass
class TaskMetadata:
    """Метаданные задачи"""
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    last_status_change: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_status_change': self.last_status_change.isoformat() if self.last_status_change else None,
            'estimated_hours': self.estimated_hours,
            'actual_hours': self.actual_hours,
            'tags': self.tags
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskMetadata':
        return cls(
            created_at=datetime.fromisoformat(data['created_at']) if data.get('created_at') else datetime.now(),
            updated_at=datetime.fromisoformat(data['updated_at']) if data.get('updated_at') else datetime.now(),
            last_status_change=datetime.fromisoformat(data['last_status_change']) if data.get('last_status_change') else None,
            estimated_hours=data.get('estimated_hours'),
            actual_hours=data.get('actual_hours'),
            tags=data.get('tags', [])
        )


@dataclass
class Task:
    """Основная модель задачи"""
    id: str = field(default_factory=lambda: str(uuid4()))

    # Основная информация
    title: str = ""
    description: str = ""
    original_text: str = ""  # Исходный текст от пользователя

    # Классификация
    task_type: TaskType = TaskType.UNKNOWN
    complexity: Complexity = Complexity.MEDIUM
    priority: Priority = Priority.MEDIUM
    status: Status = Status.NEW

    # Связи и ссылки
    jira_references: List[JiraReference] = field(default_factory=list)
    mentions: List[Person] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)  # IDs зависимых задач

    # Временные метки
    deadline: Optional[datetime] = None
    start_date: Optional[datetime] = None

    # Контекст
    context: TaskContext = field(default_factory=TaskContext)
    metadata: TaskMetadata = field(default_factory=TaskMetadata)

    # AI-генерированные поля
    ai_classification_confidence: float = 0.0  # 0.0 - 1.0
    ai_recommendations: Dict[str, Any] = field(default_factory=dict)

    # Пользовательские данные
    user_notes: str = ""
    clarifications: Dict[str, str] = field(default_factory=dict)  # Вопрос -> Ответ

    def to_dict(self) -> Dict[str, Any]:
        """Сериализация в словарь для JSON"""
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'original_text': self.original_text,
            'task_type': self.task_type.value,
            'complexity': self.complexity.value,
            'priority': self.priority.name,
            'status': self.status.value,
            'jira_references': [ref.to_dict() for ref in self.jira_references],
            'mentions': [person.to_dict() for person in self.mentions],
            'dependencies': self.dependencies,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'context': self.context.to_dict(),
            'metadata': self.metadata.to_dict(),
            'ai_classification_confidence': self.ai_classification_confidence,
            'ai_recommendations': self.ai_recommendations,
            'user_notes': self.user_notes,
            'clarifications': self.clarifications
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Task':
        """Десериализация из словаря"""
        # Парсинг TaskType
        task_type = TaskType.UNKNOWN
        if 'task_type' in data:
            for tt in TaskType:
                if tt.value == data['task_type']:
                    task_type = tt
                    break

        # Парсинг Complexity
        complexity = Complexity.MEDIUM
        if 'complexity' in data:
            for c in Complexity:
                if c.value == data['complexity']:
                    complexity = c
                    break

        # Парсинг Priority
        priority = Priority.MEDIUM
        if 'priority' in data:
            try:
                priority = Priority[data['priority']]
            except KeyError:
                priority = Priority.MEDIUM

        # Парсинг Status
        status = Status.NEW
        if 'status' in data:
            for s in Status:
                if s.value == data['status']:
                    status = s
                    break

        return cls(
            id=data.get('id', str(uuid4())),
            title=data.get('title', ''),
            description=data.get('description', ''),
            original_text=data.get('original_text', ''),
            task_type=task_type,
            complexity=complexity,
            priority=priority,
            status=status,
            jira_references=[JiraReference.from_dict(ref) for ref in data.get('jira_references', [])],
            mentions=[Person.from_dict(p) for p in data.get('mentions', [])],
            dependencies=data.get('dependencies', []),
            deadline=datetime.fromisoformat(data['deadline']) if data.get('deadline') else None,
            start_date=datetime.fromisoformat(data['start_date']) if data.get('start_date') else None,
            context=TaskContext.from_dict(data.get('context', {})),
            metadata=TaskMetadata.from_dict(data.get('metadata', {})),
            ai_classification_confidence=data.get('ai_classification_confidence', 0.0),
            ai_recommendations=data.get('ai_recommendations', {}),
            user_notes=data.get('user_notes', ''),
            clarifications=data.get('clarifications', {})
        )

    def __str__(self) -> str:
        """Строковое представление"""
        return f"[{self.id[:8]}] {self.title} ({self.status.value})"


@dataclass
class TaskHistory:
    """История изменений задачи"""
    task_id: str
    timestamp: datetime
    action: str  # create, update, status_change, priority_change
    changes: Dict[str, Any]  # Что изменилось
    user_comment: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'task_id': self.task_id,
            'timestamp': self.timestamp.isoformat(),
            'action': self.action,
            'changes': self.changes,
            'user_comment': self.user_comment
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskHistory':
        return cls(
            task_id=data['task_id'],
            timestamp=datetime.fromisoformat(data['timestamp']),
            action=data['action'],
            changes=data['changes'],
            user_comment=data.get('user_comment')
        )
