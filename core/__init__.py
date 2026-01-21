"""Core module for Task Center"""
from core.models import Task, Status, Priority, TaskType, JiraReference, TaskHistory
from core.storage import TaskStorage
from core.sqlite_storage import SQLiteStorage, migrate_json_to_sqlite
from core.api import (
    TaskAPI,
    TaskFilter,
    TaskCreateRequest,
    TaskUpdateRequest,
    get_api,
    create_task,
    get_tasks,
    update_task,
    delete_task
)

__all__ = [
    # Models
    'Task',
    'Status',
    'Priority',
    'TaskType',
    'JiraReference',
    'TaskHistory',
    # Storage
    'TaskStorage',
    'SQLiteStorage',
    'migrate_json_to_sqlite',
    # API
    'TaskAPI',
    'TaskFilter',
    'TaskCreateRequest',
    'TaskUpdateRequest',
    'get_api',
    'create_task',
    'get_tasks',
    'update_task',
    'delete_task',
]
