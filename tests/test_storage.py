"""Юнит тесты для core/storage.py"""
import pytest
import os
import json
import tempfile
from datetime import datetime

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.storage import TaskStorage
from core.models import Task, Status, Priority


class TestTaskStorage:
    """Тесты для класса TaskStorage"""

    @pytest.fixture
    def temp_storage(self, temp_dir):
        """Создать TaskStorage с временной директорией"""
        return TaskStorage(data_dir=temp_dir)

    @pytest.fixture
    def storage_with_data(self, temp_dir, sample_tasks_data):
        """Создать TaskStorage с предзагруженными данными"""
        file_path = os.path.join(temp_dir, "tasks.json")
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(sample_tasks_data, f, ensure_ascii=False, indent=2)
        return TaskStorage(data_dir=temp_dir)

    def test_init_creates_data_dir(self, temp_dir):
        """Тест: инициализация создает директорию если её нет"""
        new_dir = os.path.join(temp_dir, "new_data")
        storage = TaskStorage(data_dir=new_dir)
        assert os.path.exists(new_dir)

    def test_load_tasks_returns_list(self, storage_with_data):
        """Тест: load_tasks возвращает список задач"""
        tasks = storage_with_data.load_tasks()
        assert isinstance(tasks, list)
        assert len(tasks) == 2

    def test_load_tasks_parses_correctly(self, storage_with_data):
        """Тест: загруженные задачи имеют правильные данные"""
        tasks = storage_with_data.load_tasks()
        task = tasks[0]

        assert task.id == "task-001"
        assert task.title == "Test Task 1"
        assert len(task.jira_references) == 1
        assert task.jira_references[0].ticket_id == "REMD-123"

    def test_load_tasks_empty_file(self, temp_storage):
        """Тест: загрузка из несуществующего файла возвращает пустой список"""
        tasks = temp_storage.load_tasks()
        assert tasks == []

    def test_update_task_adds_new_task(self, temp_storage):
        """Тест: update_task добавляет новую задачу"""
        task = Task(
            id="new-task-001",
            title="New Task",
            description="New task description",
            original_text="Original text"
        )
        temp_storage.update_task(task)

        # Перезагрузить и проверить
        tasks = temp_storage.load_tasks()
        assert len(tasks) == 1
        assert tasks[0].id == "new-task-001"

    def test_update_task_modifies_existing(self, storage_with_data):
        """Тест: update_task обновляет существующую задачу"""
        tasks = storage_with_data.load_tasks()
        task = tasks[0]
        task.title = "Updated Title"

        storage_with_data.update_task(task)

        # Перезагрузить и проверить
        tasks = storage_with_data.load_tasks()
        updated_task = next(t for t in tasks if t.id == task.id)
        assert updated_task.title == "Updated Title"

    def test_get_task_by_id(self, storage_with_data):
        """Тест: получить задачу по ID"""
        task = storage_with_data.get_task_by_id("task-001")
        assert task is not None
        assert task.id == "task-001"
        assert task.title == "Test Task 1"

    def test_get_task_by_id_not_found(self, storage_with_data):
        """Тест: получить несуществующую задачу возвращает None"""
        task = storage_with_data.get_task_by_id("non-existent")
        assert task is None

    def test_delete_task(self, storage_with_data):
        """Тест: удаление задачи"""
        # Удалить task-001
        storage_with_data.delete_task("task-001")

        # Перезагрузить и проверить
        tasks = storage_with_data.load_tasks()
        assert len(tasks) == 1
        assert tasks[0].id == "task-002"

    def test_delete_task_nonexistent(self, storage_with_data):
        """Тест: удаление несуществующей задачи"""
        initial_count = len(storage_with_data.load_tasks())
        storage_with_data.delete_task("non-existent")
        # Количество задач не должно измениться
        assert len(storage_with_data.load_tasks()) == initial_count

    def test_save_tasks_creates_backup(self, storage_with_data, temp_dir):
        """Тест: сохранение создает резервную копию"""
        tasks = storage_with_data.load_tasks()
        # Сохранить со случайным изменением
        if tasks:
            tasks[0].title = "Changed"
            storage_with_data.save_tasks(tasks)

        # Проверить что backup существует
        backups = list(os.path.join(temp_dir, f) for f in os.listdir(temp_dir)
                      if f.startswith("tasks_backup"))
        assert len(backups) > 0

    def test_get_statistics(self, storage_with_data):
        """Тест: получение статистики по задачам"""
        stats = storage_with_data.get_statistics()

        assert stats['total_tasks'] == 2
        assert 'by_status' in stats
        assert 'by_priority' in stats
        assert 'by_type' in stats


class TestTaskStorageEdgeCases:
    """Граничные случаи для TaskStorage"""

    @pytest.fixture
    def temp_storage(self, temp_dir):
        """Создать TaskStorage с временной директорией"""
        return TaskStorage(data_dir=temp_dir)

    def test_load_corrupted_json(self, temp_dir):
        """Тест: обработка некорректного JSON"""
        file_path = os.path.join(temp_dir, "tasks.json")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write("{ invalid json }")

        storage = TaskStorage(data_dir=temp_dir)
        # Должно возвращать пустой список
        tasks = storage.load_tasks()
        assert tasks == []

    def test_save_multiple_tasks(self, temp_storage):
        """Тест: сохранение нескольких задач"""
        for i in range(5):
            task = Task(
                id=f"task-{i:03d}",
                title=f"Task {i}",
                description=f"Description {i}",
                original_text=f"Original {i}"
            )
            temp_storage.update_task(task)

        tasks = temp_storage.load_tasks()
        assert len(tasks) == 5

    def test_task_with_unicode(self, temp_storage):
        """Тест: обработка юникода"""
        task = Task(
            id="unicode-task",
            title="Задача с юникодом: ФЛК, СЭМД, ЕГИСЗ",
            description="Описание на русском языке с emoji 🎉",
            original_text="Оригинальный текст"
        )
        temp_storage.update_task(task)

        loaded_task = temp_storage.get_task_by_id("unicode-task")
        assert "ФЛК" in loaded_task.title
        assert "🎉" in loaded_task.description

    def test_update_updates_timestamp(self, temp_storage):
        """Тест: обновление обновляет временную метку"""
        task = Task(
            id="timestamp-test",
            title="Test",
            description="Test",
            original_text="Test"
        )
        temp_storage.update_task(task)

        # Получить и проверить что updated_at установлена
        loaded = temp_storage.get_task_by_id("timestamp-test")
        assert loaded.metadata.updated_at is not None

    def test_json_encoding_with_cyrillic(self, temp_storage):
        """Тест: правильное кодирование JSON с кириллицей"""
        task = Task(
            id="cyrillic-test",
            title="Проверка кодировки кириллицы",
            description="Это должно правильно сохраниться в JSON",
            original_text="Исходный текст"
        )
        temp_storage.update_task(task)

        # Прочитать файл напрямую и проверить что кириллица сохранена правильно
        with open(os.path.join(temp_storage.data_dir, "tasks.json"), 'r', encoding='utf-8') as f:
            data = json.load(f)

        saved_task_data = data['tasks'][0]
        assert saved_task_data['title'] == "Проверка кодировки кириллицы"
        assert "кодировки" in saved_task_data['title']
