"""Functional API for Task Center - programmatic access to task management"""
from typing import List, Optional, Dict, Any, Callable
from datetime import datetime
from dataclasses import dataclass

from core.models import Task, Status, Priority, TaskType, TaskHistory
from core.storage import TaskStorage
from analysis.prioritizer import TaskPrioritizer
from analysis.recommendation_engine import RecommendationEngine
from utils.logging_config import get_logger, LogTimer

logger = get_logger('api')


@dataclass
class TaskFilter:
    """Filter criteria for task queries"""
    status: Optional[Status] = None
    priority: Optional[Priority] = None
    task_type: Optional[TaskType] = None
    has_deadline: Optional[bool] = None
    is_overdue: Optional[bool] = None
    search_query: Optional[str] = None
    jira_key: Optional[str] = None
    project: Optional[str] = None


@dataclass
class TaskCreateRequest:
    """Request to create a new task"""
    title: str
    description: str = ""
    original_text: str = ""
    task_type: TaskType = TaskType.UNKNOWN
    priority: Priority = Priority.MEDIUM
    deadline: Optional[datetime] = None
    jira_references: Optional[List[str]] = None
    project: Optional[str] = None


@dataclass
class TaskUpdateRequest:
    """Request to update a task"""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Status] = None
    priority: Optional[Priority] = None
    task_type: Optional[TaskType] = None
    deadline: Optional[datetime] = None


class TaskAPI:
    """
    Functional API for Task Center.

    Provides a clean, programmatic interface for task management operations.
    All methods are designed to be easily testable and composable.

    Usage:
        api = TaskAPI()

        # Create a task
        task = api.create_task(TaskCreateRequest(
            title="Review PR",
            priority=Priority.HIGH
        ))

        # Query tasks
        tasks = api.get_tasks(TaskFilter(status=Status.NEW))

        # Update task
        api.update_task(task.id, TaskUpdateRequest(status=Status.IN_PROGRESS))

        # Get recommendations
        recommendations = api.get_daily_recommendations(hours=8)
    """

    def __init__(self, storage: Optional[TaskStorage] = None):
        """
        Initialize the API.

        Args:
            storage: Optional custom storage instance. Uses default if not provided.
        """
        self._storage = storage or TaskStorage()
        self._prioritizer = TaskPrioritizer()
        self._recommender = RecommendationEngine(self._prioritizer)
        self._on_change_callbacks: List[Callable[[str, Task], None]] = []

    # ==================== Task CRUD Operations ====================

    def create_task(self, request: TaskCreateRequest) -> Task:
        """
        Create a new task.

        Args:
            request: Task creation parameters

        Returns:
            Created Task instance
        """
        with LogTimer(logger, f"create_task: {request.title}"):
            task = Task(
                title=request.title,
                description=request.description,
                original_text=request.original_text or request.title,
                task_type=request.task_type,
                priority=request.priority,
                deadline=request.deadline,
                project=request.project
            )

            # Add Jira references if provided
            if request.jira_references:
                from core.models import JiraReference
                task.jira_references = [
                    JiraReference(key=key) for key in request.jira_references
                ]

            tasks = self._storage.load_tasks()
            tasks.append(task)
            self._storage.save_tasks(tasks)

            # Record history
            self._record_history(task.id, 'created', None, task.status.value)

            # Notify callbacks
            self._notify_change('created', task)

            logger.info(f"Task created: {task.id[:8]} - {task.title}")
            return task

    def get_task(self, task_id: str) -> Optional[Task]:
        """
        Get a task by ID.

        Args:
            task_id: Full or partial task ID

        Returns:
            Task if found, None otherwise
        """
        return self._storage.get_task_by_id(task_id)

    def get_tasks(self, filter: Optional[TaskFilter] = None) -> List[Task]:
        """
        Get tasks with optional filtering.

        Args:
            filter: Filter criteria (all optional)

        Returns:
            List of matching tasks
        """
        tasks = self._storage.load_tasks()

        if filter is None:
            return tasks

        # Apply filters
        if filter.status is not None:
            tasks = [t for t in tasks if t.status == filter.status]

        if filter.priority is not None:
            tasks = [t for t in tasks if t.priority == filter.priority]

        if filter.task_type is not None:
            tasks = [t for t in tasks if t.task_type == filter.task_type]

        if filter.has_deadline is not None:
            if filter.has_deadline:
                tasks = [t for t in tasks if t.deadline is not None]
            else:
                tasks = [t for t in tasks if t.deadline is None]

        if filter.is_overdue is not None:
            now = datetime.now()
            if filter.is_overdue:
                tasks = [t for t in tasks if t.deadline and t.deadline < now and t.status != Status.DONE]
            else:
                tasks = [t for t in tasks if not (t.deadline and t.deadline < now)]

        if filter.search_query:
            query = filter.search_query.lower()
            tasks = [t for t in tasks if query in t.title.lower() or query in t.description.lower()]

        if filter.jira_key:
            tasks = [t for t in tasks if any(jr.key == filter.jira_key for jr in t.jira_references)]

        if filter.project:
            tasks = [t for t in tasks if t.project == filter.project]

        return tasks

    def update_task(self, task_id: str, request: TaskUpdateRequest) -> Optional[Task]:
        """
        Update a task.

        Args:
            task_id: Task ID to update
            request: Fields to update (None values are ignored)

        Returns:
            Updated Task if found, None otherwise
        """
        task = self._storage.get_task_by_id(task_id)
        if not task:
            logger.warning(f"Task not found for update: {task_id}")
            return None

        with LogTimer(logger, f"update_task: {task_id[:8]}"):
            old_status = task.status.value

            # Apply updates
            if request.title is not None:
                task.title = request.title
            if request.description is not None:
                task.description = request.description
            if request.status is not None:
                task.status = request.status
            if request.priority is not None:
                task.priority = request.priority
            if request.task_type is not None:
                task.task_type = request.task_type
            if request.deadline is not None:
                task.deadline = request.deadline

            self._storage.update_task(task)

            # Record status change if applicable
            if request.status is not None and old_status != request.status.value:
                self._record_history(task.id, 'status_changed', old_status, request.status.value)

            self._notify_change('updated', task)
            logger.info(f"Task updated: {task_id[:8]}")
            return task

    def delete_task(self, task_id: str) -> bool:
        """
        Delete a task.

        Args:
            task_id: Task ID to delete

        Returns:
            True if deleted, False if not found
        """
        task = self._storage.get_task_by_id(task_id)
        if not task:
            logger.warning(f"Task not found for deletion: {task_id}")
            return False

        self._storage.delete_task(task.id)
        self._record_history(task.id, 'deleted', task.status.value, None)
        self._notify_change('deleted', task)
        logger.info(f"Task deleted: {task_id[:8]}")
        return True

    # ==================== Status Operations ====================

    def start_task(self, task_id: str) -> Optional[Task]:
        """Set task status to IN_PROGRESS"""
        return self.update_task(task_id, TaskUpdateRequest(status=Status.IN_PROGRESS))

    def complete_task(self, task_id: str) -> Optional[Task]:
        """Set task status to DONE"""
        return self.update_task(task_id, TaskUpdateRequest(status=Status.DONE))

    def block_task(self, task_id: str) -> Optional[Task]:
        """Set task status to BLOCKED"""
        return self.update_task(task_id, TaskUpdateRequest(status=Status.BLOCKED))

    def reopen_task(self, task_id: str) -> Optional[Task]:
        """Set task status to NEW"""
        return self.update_task(task_id, TaskUpdateRequest(status=Status.NEW))

    # ==================== Analysis & Recommendations ====================

    def prioritize_tasks(self, tasks: Optional[List[Task]] = None) -> List[Task]:
        """
        Get tasks sorted by priority score.

        Args:
            tasks: Tasks to prioritize. Uses all tasks if not provided.

        Returns:
            Tasks sorted by priority score (highest first)
        """
        if tasks is None:
            tasks = self.get_tasks(TaskFilter(status=Status.NEW))

        return self._prioritizer.prioritize(tasks)

    def get_daily_recommendations(self, hours: int = 8) -> Dict[str, Any]:
        """
        Get task recommendations for today.

        Args:
            hours: Available hours for work

        Returns:
            Dict with 'tasks', 'total_hours', 'focus_areas' keys
        """
        tasks = self._storage.load_tasks()
        return self._recommender.get_recommendations(tasks, available_hours=hours)

    def get_statistics(self) -> Dict[str, Any]:
        """Get task statistics"""
        return self._storage.get_statistics()

    def get_task_history(self, task_id: str) -> List[TaskHistory]:
        """Get history for a specific task"""
        return self._storage.get_task_history(task_id)

    # ==================== Event Handling ====================

    def on_change(self, callback: Callable[[str, Task], None]):
        """
        Register a callback for task changes.

        Args:
            callback: Function(event_type, task) called on changes.
                     event_type is 'created', 'updated', or 'deleted'
        """
        self._on_change_callbacks.append(callback)

    def _notify_change(self, event_type: str, task: Task):
        """Notify all registered callbacks"""
        for callback in self._on_change_callbacks:
            try:
                callback(event_type, task)
            except Exception as e:
                logger.error(f"Callback error: {e}")

    def _record_history(self, task_id: str, action: str, old_value: Any, new_value: Any):
        """Record a history event"""
        self._storage.save_history({
            'task_id': task_id,
            'action': action,
            'old_value': old_value,
            'new_value': new_value,
            'timestamp': datetime.now().isoformat()
        })


# Convenience functions for quick access
_default_api: Optional[TaskAPI] = None


def get_api() -> TaskAPI:
    """Get the default TaskAPI instance"""
    global _default_api
    if _default_api is None:
        _default_api = TaskAPI()
    return _default_api


def create_task(title: str, **kwargs) -> Task:
    """Quick function to create a task"""
    return get_api().create_task(TaskCreateRequest(title=title, **kwargs))


def get_tasks(**filter_kwargs) -> List[Task]:
    """Quick function to get tasks"""
    filter = TaskFilter(**filter_kwargs) if filter_kwargs else None
    return get_api().get_tasks(filter)


def update_task(task_id: str, **kwargs) -> Optional[Task]:
    """Quick function to update a task"""
    return get_api().update_task(task_id, TaskUpdateRequest(**kwargs))


def delete_task(task_id: str) -> bool:
    """Quick function to delete a task"""
    return get_api().delete_task(task_id)
