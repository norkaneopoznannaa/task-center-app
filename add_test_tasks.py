#!/usr/bin/env python3
"""Скрипт для добавления тестовых задач"""

from core.storage import TaskStorage
from parsers.task_parser import TaskParser

test_tasks_text = """
1. Задача с ИА. Придумать обоснование: EGISZREMD-15263
2. Проверка изменения имени пространств в СЭМД (EGISZREMD-15284)
3. Задача по КУ ФЭР от Максима
4. Задача Саиды https://jira.i-novus.ru/browse/AN-1418
5. Подготовить примеры использования клода и провести демо
6. Исследование паттернов поведения МИС по дублированию
7. Завести историю с кнопкой переотправки данных на витрину
8. Регламент ФЛК - дополнить - СРОЧНО
9. Указать как заводить роль администратор ГИСЗ субъекта
10. Доработать лаунчер: добавить обязательность русского языка
"""

# Парсинг
parser = TaskParser()
tasks = parser.parse_task_list(test_tasks_text)

print(f"Распознано задач: {len(tasks)}")

# Сохранение
storage = TaskStorage()
existing_tasks = storage.load_tasks()
all_tasks = existing_tasks + tasks
storage.save_tasks(all_tasks)

print(f"Sohraneno {len(tasks)} zadach")
print("\nIspolzuyte: python task_manager.py list")
