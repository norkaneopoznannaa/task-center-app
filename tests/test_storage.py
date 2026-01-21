"""Unit tests for core/storage.py"""
import pytest
import os
import json
import tempfile
from datetime import datetime

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.storage import TaskStorage
from core.models import Task, TaskType, Priority, Status, Complexity


class TestTaskStorage:
    """Tests for TaskStorage class"""

    @pytest.fixture
    def temp_storage(self, temp_dir):
        """Create a TaskStorage with temporary directory"""
        return TaskStorage(data_dir=temp_dir)

    @pytest.fixture
    def storage_with_data(self, temp_dir, sample_tasks_data):
        """Create a TaskStorage with pre-existing data"""
        file_path = os.path.join(temp_dir, "tasks.json")
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(sample_tasks_data, f, ensure_ascii=False, indent=2)
        return TaskStorage(data_dir=temp_dir)

    def test_init_creates_data_dir(self, temp_dir):
        """Test that initialization creates data directory if it doesn't exist"""
        new_dir = os.path.join(temp_dir, "new_data")
        storage = TaskStorage(data_dir=new_dir)
        assert os.path.exists(new_dir)

    def test_init_creates_empty_file(self, temp_storage, temp_dir):
        """Test that initialization creates empty tasks.json if it doesn't exist"""
        file_path = os.path.join(temp_dir, "tasks.json")
        assert os.path.exists(file_path)

        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        assert data["version"] == "1.0"
        assert data["tasks"] == []

    def test_load_tasks_returns_list(self, storage_with_data):
        """Test that load_tasks returns a list of tasks"""
        tasks = storage_with_data.load_tasks()
        assert isinstance(tasks, list)
        assert len(tasks) == 2

    def test_load_tasks_parses_correctly(self, storage_with_data):
        """Test that loaded tasks have correct data"""
        tasks = storage_with_data.load_tasks()
        task = tasks[0]

        assert task.id == "task-001"
        assert task.title == "Test Task 1"
        assert len(task.jira_references) == 1
        assert task.jira_references[0].ticket_id == "REMD-123"

    def test_save_task_adds_new_task(self, temp_storage):
        """Test saving a new task"""
        task = Task(
            id="new-task-001",
            title="New Task",
            description="New task description",
            original_text="Original text"
        )
        temp_storage.save_task(task)

        # Reload and verify
        tasks = temp_storage.load_tasks()
        assert len(tasks) == 1
        assert tasks[0].id == "new-task-001"

    def test_save_task_updates_existing(self, storage_with_data):
        """Test that save_task updates existing task"""
        tasks = storage_with_data.load_tasks()
        task = tasks[0]
        task.title = "Updated Title"

        storage_with_data.save_task(task)

        # Reload and verify
        tasks = storage_with_data.load_tasks()
        updated_task = next(t for t in tasks if t.id == task.id)
        assert updated_task.title == "Updated Title"

    def test_get_task_by_id(self, storage_with_data):
        """Test getting a task by ID"""
        task = storage_with_data.get_task_by_id("task-001")
        assert task is not None
        assert task.id == "task-001"
        assert task.title == "Test Task 1"

    def test_get_task_by_id_not_found(self, storage_with_data):
        """Test getting a non-existent task returns None"""
        task = storage_with_data.get_task_by_id("non-existent")
        assert task is None

    def test_delete_task(self, storage_with_data):
        """Test deleting a task"""
        result = storage_with_data.delete_task("task-001")
        assert result is True

        tasks = storage_with_data.load_tasks()
        assert len(tasks) == 1
        assert tasks[0].id == "task-002"

    def test_delete_task_not_found(self, storage_with_data):
        """Test deleting a non-existent task returns False"""
        result = storage_with_data.delete_task("non-existent")
        assert result is False

    def test_get_tasks_by_status(self, storage_with_data):
        """Test filtering tasks by status"""
        in_progress = storage_with_data.get_tasks_by_status(Status.IN_PROGRESS)
        assert len(in_progress) == 1
        assert in_progress[0].id == "task-002"

    def test_get_tasks_by_priority(self, storage_with_data):
        """Test filtering tasks by priority"""
        critical = storage_with_data.get_tasks_by_priority(Priority.CRITICAL)
        assert len(critical) == 1

    def test_update_task_status(self, storage_with_data):
        """Test updating task status"""
        storage_with_data.update_task_status("task-001", Status.IN_PROGRESS)

        task = storage_with_data.get_task_by_id("task-001")
        assert task.status == Status.IN_PROGRESS

    def test_backup_creates_file(self, storage_with_data, temp_dir):
        """Test that backup creates a backup file"""
        backup_path = storage_with_data.backup()
        assert os.path.exists(backup_path)
        assert "backup" in backup_path


class TestTaskStorageEdgeCases:
    """Edge case tests for TaskStorage"""

    @pytest.fixture
    def temp_storage(self, temp_dir):
        """Create a TaskStorage with temporary directory"""
        return TaskStorage(data_dir=temp_dir)

    def test_load_corrupted_json(self, temp_dir):
        """Test handling of corrupted JSON file"""
        file_path = os.path.join(temp_dir, "tasks.json")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write("{ invalid json }")

        storage = TaskStorage(data_dir=temp_dir)
        # Should handle gracefully and return empty list or raise specific error
        try:
            tasks = storage.load_tasks()
            assert tasks == []  # If it recovers
        except json.JSONDecodeError:
            pass  # Expected if it raises

    def test_save_multiple_tasks(self, temp_storage):
        """Test saving multiple tasks"""
        for i in range(5):
            task = Task(
                id=f"task-{i:03d}",
                title=f"Task {i}",
                description=f"Description {i}",
                original_text=f"Original {i}"
            )
            temp_storage.save_task(task)

        tasks = temp_storage.load_tasks()
        assert len(tasks) == 5

    def test_task_with_unicode(self, temp_storage):
        """Test handling of unicode characters"""
        task = Task(
            id="unicode-task",
            title="Задача с юникодом: ФЛК, СЭМД, ЕГИСЗ",
            description="Описание на русском языке с emoji 🎉",
            original_text="Оригинальный текст"
        )
        temp_storage.save_task(task)

        loaded_task = temp_storage.get_task_by_id("unicode-task")
        assert "ФЛК" in loaded_task.title
        assert "🎉" in loaded_task.description
