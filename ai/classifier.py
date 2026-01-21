"""Классификатор задач через Claude API"""
from typing import List, Optional, Dict, Any

from core.models import Task, TaskType, Complexity, Priority
from ai.claude_client import ClaudeClient
from ai.prompts.classification import (
    get_classification_prompts,
    get_batch_classification_prompt,
    BATCH_CLASSIFICATION_SYSTEM_PROMPT
)


class TaskClassifier:
    """Классификатор задач с использованием Claude API"""

    def __init__(self, claude_client: ClaudeClient = None):
        """
        Инициализация классификатора

        Args:
            claude_client: Клиент Claude API (если None, создается новый)
        """
        self.claude = claude_client or ClaudeClient()

    def classify_single(
        self,
        task: Task,
        context: Optional[str] = None
    ) -> Task:
        """
        Классификация одной задачи

        Args:
            task: Задача для классификации
            context: Дополнительный контекст (например, из документации)

        Returns:
            Задача с обновленными полями классификации
        """
        # Генерация промптов
        system_prompt, user_prompt = get_classification_prompts(
            title=task.title,
            description=task.description,
            context=context
        )

        try:
            # Получение структурированного ответа
            result = self.claude.structured_output(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.5
            )

            # Применение результатов к задаче
            task = self._apply_classification(task, result)

        except Exception as e:
            print(f"Ошибка классификации: {e}")
            # Оставляем дефолтные значения при ошибке

        return task

    def classify_batch(
        self,
        tasks: List[Task],
        context: Optional[str] = None
    ) -> List[Task]:
        """
        Пакетная классификация задач

        Args:
            tasks: Список задач для классификации
            context: Дополнительный контекст

        Returns:
            Список задач с обновленными полями
        """
        if not tasks:
            return []

        # Подготовка данных для пакетной обработки
        tasks_data = [
            {
                "title": task.title,
                "description": task.description or task.title
            }
            for task in tasks
        ]

        try:
            # Формирование промпта
            user_prompt = get_batch_classification_prompt(tasks_data)
            system_prompt = BATCH_CLASSIFICATION_SYSTEM_PROMPT

            if context:
                system_prompt += f"\n\n## Дополнительный контекст:\n{context}"

            # Получение результатов
            results = self.claude.batch_classify(
                tasks_data=tasks_data,
                system_prompt=system_prompt,
                temperature=0.5
            )

            # Применение результатов
            for i, result in enumerate(results):
                if i < len(tasks):
                    # task_index в результате начинается с 1
                    task_idx = result.get('task_index', i + 1) - 1
                    if 0 <= task_idx < len(tasks):
                        tasks[task_idx] = self._apply_classification(tasks[task_idx], result)

        except Exception as e:
            print(f"Ошибка пакетной классификации: {e}")
            # Пробуем классифицировать по одной
            for i, task in enumerate(tasks):
                try:
                    tasks[i] = self.classify_single(task, context)
                except Exception:
                    pass  # Оставляем дефолтные значения

        return tasks

    def _apply_classification(self, task: Task, result: Dict[str, Any]) -> Task:
        """
        Применение результатов классификации к задаче

        Args:
            task: Задача
            result: Результат классификации от Claude

        Returns:
            Обновленная задача
        """
        # Тип задачи
        task_type_str = result.get('task_type', 'Неизвестно')
        for tt in TaskType:
            if tt.value == task_type_str:
                task.task_type = tt
                break

        # Сложность
        complexity_str = result.get('complexity', 'средняя')
        for c in Complexity:
            if c.value == complexity_str:
                task.complexity = c
                break

        # Приоритет
        priority_value = result.get('priority', 3)
        try:
            if priority_value == 5:
                task.priority = Priority.CRITICAL
            elif priority_value == 4:
                task.priority = Priority.HIGH
            elif priority_value == 3:
                task.priority = Priority.MEDIUM
            elif priority_value == 2:
                task.priority = Priority.LOW
            else:
                task.priority = Priority.BACKLOG
        except (ValueError, KeyError):
            task.priority = Priority.MEDIUM

        # Уверенность AI
        task.ai_classification_confidence = result.get('confidence', 0.0)

        # Дополнительная информация
        extracted_info = result.get('extracted_info', {})

        # Оценка времени
        estimated_hours = extracted_info.get('estimated_hours')
        if estimated_hours:
            task.metadata.estimated_hours = float(estimated_hours)

        # Ключевые термины
        key_terms = extracted_info.get('key_terms', [])
        if key_terms:
            task.context.key_terms = key_terms

        # Связанные системы
        related_systems = extracted_info.get('related_systems', [])
        if related_systems:
            task.context.related_systems = related_systems

        # Сохранение объяснения в AI рекомендациях
        task.ai_recommendations = {
            'reasoning': result.get('reasoning', ''),
            'urgency_keywords': extracted_info.get('urgency_keywords', []),
            'classification_result': result
        }

        return task

    def test_classification(self) -> bool:
        """
        Тест классификации (проверка работы API)

        Returns:
            True если тест успешен
        """
        try:
            test_task = Task()
            test_task.title = "Проверка работы ФЛК - срочно"
            test_task.description = "Необходимо проверить работу формально-логического контроля в продакшене"

            result = self.classify_single(test_task)

            # Проверяем что классификация сработала
            return (
                result.task_type != TaskType.UNKNOWN and
                result.ai_classification_confidence > 0
            )

        except Exception as e:
            print(f"Ошибка теста: {e}")
            return False
