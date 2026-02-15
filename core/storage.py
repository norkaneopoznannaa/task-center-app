"""Менеджер хранения данных для Task Center"""
import json
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
import shutil

from core.models import Task, TaskHistory
from config import Config


class TaskStorage:
    """Менеджер хранения данных"""

    def __init__(self, data_dir: str = None):
        if data_dir:
            self.data_dir = Path(data_dir)
        else:
            self.data_dir = Config.DATA_DIR

        self.data_dir.mkdir(exist_ok=True)

        self.tasks_file = self.data_dir / "tasks.json"
        self.history_file = self.data_dir / "history.json"
        self.metadata_file = self.data_dir / "metadata.json"

    def save_tasks(self, tasks: List[Task]):
        """Сохранение списка задач"""
        # Создание backup перед сохранением
        if self.tasks_file.exists():
            backup_path = self.data_dir / f"tasks_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            shutil.copy(self.tasks_file, backup_path)

            # Удаление старых бэкапов (храним последние 10)
            backups = sorted(self.data_dir.glob("tasks_backup_*.json"))
            if len(backups) > 10:
                for old_backup in backups[:-10]:
                    old_backup.unlink()

        # Сериализация
        data = {
            'version': '1.0',
            'updated_at': datetime.now().isoformat(),
            'tasks': [task.to_dict() for task in tasks]
        }

        with open(self.tasks_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load_tasks(self) -> List[Task]:
        """Загрузка задач"""
        if not self.tasks_file.exists():
            return []

        try:
            with open(self.tasks_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            return [Task.from_dict(t) for t in data.get('tasks', [])]
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Ошибка при загрузке задач: {e}")
            return []

    def get_task_by_id(self, task_id: str) -> Task | None:
        """Получение задачи по ID (или по началу ID)"""
        tasks = self.load_tasks()

        # Точное совпадение
        for task in tasks:
            if task.id == task_id:
                return task

        # Совпадение по началу ID
        matching = [task for task in tasks if task.id.startswith(task_id)]
        if len(matching) == 1:
            return matching[0]
        elif len(matching) > 1:
            raise ValueError(f"Найдено несколько задач с ID начинающимся на '{task_id}'. Укажите более полный ID.")

        return None

    def update_task(self, task: Task):
        """Обновление одной задачи"""
        tasks = self.load_tasks()

        for i, t in enumerate(tasks):
            if t.id == task.id:
                task.metadata.updated_at = datetime.now()
                tasks[i] = task
                self.save_tasks(tasks)
                return

        # Если задача не найдена, добавляем
        tasks.append(task)
        self.save_tasks(tasks)

    def delete_task(self, task_id: str):
        """Удаление задачи"""
        tasks = self.load_tasks()
        tasks = [t for t in tasks if t.id != task_id and not t.id.startswith(task_id)]
        self.save_tasks(tasks)

    def save_history(self, event: TaskHistory | Dict[str, Any]):
        """Добавление события в историю"""
        history = self._load_history()

        if isinstance(event, TaskHistory):
            history.append(event.to_dict())
        else:
            # Если передан dict, добавляем timestamp если его нет
            if 'timestamp' not in event:
                event['timestamp'] = datetime.now().isoformat()
            history.append(event)

        with open(self.history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

    def _load_history(self) -> List[Dict[str, Any]]:
        """Загрузка истории"""
        if not self.history_file.exists():
            return []

        try:
            with open(self.history_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, KeyError):
            return []

    def get_task_history(self, task_id: str) -> List[TaskHistory]:
        """Получение истории конкретной задачи"""
        history = self._load_history()
        task_history = [h for h in history if h.get('task_id') == task_id]
        return [TaskHistory.from_dict(h) for h in task_history]

    def save_metadata(self, metadata: Dict[str, Any]):
        """Сохранение метаданных проекта"""
        metadata['updated_at'] = datetime.now().isoformat()

        with open(self.metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    def load_metadata(self) -> Dict[str, Any]:
        """Загрузка метаданных проекта"""
        if not self.metadata_file.exists():
            return {}

        try:
            with open(self.metadata_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, KeyError):
            return {}

    def get_statistics(self) -> Dict[str, Any]:
        """Получение статистики по задачам"""
        tasks = self.load_tasks()

        from collections import Counter
        from core.models import Status, Priority, TaskType
        from datetime import timezone

        now = datetime.now(timezone.utc)
        return {
            'total_tasks': len(tasks),
            'by_status': dict(Counter(t.status.value for t in tasks)),
            'by_priority': dict(Counter(t.priority.name for t in tasks)),
            'by_type': dict(Counter(t.task_type.value for t in tasks)),
            'with_deadline': len([t for t in tasks if t.deadline]),
            'overdue': len([t for t in tasks if t.deadline and t.deadline < now and t.status != Status.DONE]),
        }
