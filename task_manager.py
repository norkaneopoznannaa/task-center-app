#!/usr/bin/env python3
"""
Task Center - AI-помощник для управления задачами проекта РЭМД

Системный аналитик может использовать этот инструмент для:
- Добавления задач в свободной форме
- Автоматической классификации через AI
- Приоритизации и рекомендаций
- Управления жизненным циклом задач

Использование:
    python task_manager.py add        - Добавить задачи
    python task_manager.py list       - Показать все задачи
    python task_manager.py show <id>  - Детали задачи
    python task_manager.py status <id> <status>  - Обновить статус
    python task_manager.py stats      - Статистика
    python task_manager.py delete <id> - Удалить задачу
"""

import sys
from config import Config
from core.cli_interface import cli


def main():
    """Главная точка входа"""
    try:
        # Валидация конфигурации
        try:
            Config.validate()
        except ValueError as e:
            # Если нет API ключа, показываем предупреждение, но не блокируем базовый функционал
            if "CLAUDE_API_KEY" in str(e):
                print(f"⚠️  Предупреждение: {e}")
                print("Базовый функционал доступен, но AI классификация будет недоступна.")
                print()

        # Запуск CLI
        cli()

    except KeyboardInterrupt:
        print("\n\nПрервано пользователем")
        sys.exit(0)
    except Exception as e:
        print(f"Ошибка: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
