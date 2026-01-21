"""
Модуль приоритизации задач

Рассчитывает priority score для каждой задачи на основе множества факторов
"""

from typing import List, Dict
from datetime import datetime, timedelta
from core.models import Task, Priority, Status


class TaskPrioritizer:
    """Приоритизация задач с мультифакторным анализом"""

    # Веса для расчета priority_score (сумма = 1.0)
    WEIGHTS = {
        'base_priority': 0.30,    # Базовый приоритет из AI
        'deadline': 0.25,          # Близость дедлайна
        'urgency_keywords': 0.20,  # Ключевые слова срочности
        'blocking': 0.15,          # Блокирует ли другие задачи
        'ai_confidence': 0.10      # Уверенность AI классификации
    }

    # Ключевые слова срочности в тексте
    URGENCY_KEYWORDS = ['срочно', 'критично', 'блокер', 'asap', 'горит', 'сегодня', 'немедленно']

    def calculate_score(self, task: Task, all_tasks: List[Task]) -> float:
        """
        Рассчитать priority score (0-100) для задачи

        Args:
            task: Задача для оценки
            all_tasks: Все задачи (для анализа зависимостей)

        Returns:
            Priority score от 0 до 100
        """
        scores = {
            'base_priority': self._score_base_priority(task),
            'deadline': self._score_deadline(task),
            'urgency_keywords': self._score_urgency_keywords(task),
            'blocking': self._score_blocking(task, all_tasks),
            'ai_confidence': self._score_ai_confidence(task)
        }

        # Взвешенная сумма
        total_score = sum(
            scores[factor] * self.WEIGHTS[factor]
            for factor in scores
        )

        return round(total_score * 100, 1)

    def _score_base_priority(self, task: Task) -> float:
        """Оценка базового приоритета (0.0-1.0)"""
        priority_map = {
            Priority.CRITICAL: 1.0,
            Priority.HIGH: 0.8,
            Priority.MEDIUM: 0.5,
            Priority.LOW: 0.3,
            Priority.BACKLOG: 0.1
        }
        return priority_map.get(task.priority, 0.5)

    def _score_deadline(self, task: Task) -> float:
        """Оценка близости дедлайна (0.0-1.0)"""
        if not task.deadline:
            return 0.3  # Нет дедлайна = средняя важность

        days_until = (task.deadline - datetime.now()).days

        if days_until < 0:
            return 1.0  # Просрочено!
        elif days_until == 0:
            return 1.0  # Сегодня
        elif days_until == 1:
            return 0.9  # Завтра
        elif days_until <= 3:
            return 0.8  # Ближайшие 3 дня
        elif days_until <= 7:
            return 0.6  # На этой неделе
        elif days_until <= 14:
            return 0.4  # В течение 2 недель
        else:
            return 0.2  # Далеко в будущем

    def _score_urgency_keywords(self, task: Task) -> float:
        """Оценка наличия слов срочности (0.0-1.0)"""
        text_to_check = f"{task.title} {task.description} {task.original_text}".lower()

        found_keywords = [
            keyword for keyword in self.URGENCY_KEYWORDS
            if keyword in text_to_check
        ]

        if not found_keywords:
            return 0.0

        # Чем больше ключевых слов, тем выше оценка
        return min(1.0, len(found_keywords) * 0.5)

    def _score_blocking(self, task: Task, all_tasks: List[Task]) -> float:
        """Оценка блокирования других задач (0.0-1.0)"""
        if not task.dependencies:
            return 0.0

        # Считаем сколько задач зависят от этой
        dependent_tasks = [
            t for t in all_tasks
            if task.id in t.dependencies and t.status != Status.DONE
        ]

        if not dependent_tasks:
            return 0.0

        # Чем больше задач блокируется, тем выше оценка
        return min(1.0, len(dependent_tasks) * 0.3)

    def _score_ai_confidence(self, task: Task) -> float:
        """Оценка уверенности AI классификации (0.0-1.0)"""
        return task.ai_classification_confidence

    def prioritize_tasks(self, tasks: List[Task]) -> List[Dict]:
        """
        Приоритизировать список задач

        Args:
            tasks: Список задач для приоритизации

        Returns:
            Список задач с priority_score, отсортированный по убыванию
        """
        # Фильтруем только незавершенные задачи
        active_tasks = [t for t in tasks if t.status != Status.DONE and t.status != Status.CANCELLED]

        results = []
        for task in active_tasks:
            score = self.calculate_score(task, tasks)

            # Определяем уровень важности
            if score >= 80:
                importance_level = "[!] КРИТИЧНО"
                importance_color = "red"
            elif score >= 60:
                importance_level = "[^] Высокий"
                importance_color = "yellow"
            elif score >= 40:
                importance_level = "[-] Средний"
                importance_color = "cyan"
            else:
                importance_level = "[~] Низкий"
                importance_color = "dim"

            results.append({
                'task': task,
                'score': score,
                'importance_level': importance_level,
                'importance_color': importance_color
            })

        # Сортируем по убыванию score
        results.sort(key=lambda x: x['score'], reverse=True)

        return results

    def get_recommendation_text(self, score: float) -> str:
        """Получить текстовую рекомендацию по score"""
        if score >= 80:
            return "Начать немедленно! Критичная задача."
        elif score >= 60:
            return "Сделать сегодня. Высокий приоритет."
        elif score >= 40:
            return "Запланировать на неделю."
        else:
            return "Можно отложить."
