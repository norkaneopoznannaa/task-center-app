"""
Модуль рекомендаций задач на день

Подбирает оптимальный набор задач исходя из доступного времени
"""

from typing import List, Dict
from core.models import Task, Status
from analysis.prioritizer import TaskPrioritizer
from config import Config


class RecommendationEngine:
    """Движок рекомендаций задач"""

    def __init__(self):
        self.prioritizer = TaskPrioritizer()

    def recommend_for_today(
        self,
        tasks: List[Task],
        available_hours: float = None
    ) -> Dict:
        """
        Рекомендовать задачи на сегодня

        Args:
            tasks: Все задачи
            available_hours: Доступные часы (по умолчанию из конфига)

        Returns:
            Словарь с рекомендациями
        """
        if available_hours is None:
            available_hours = Config.DEFAULT_AVAILABLE_HOURS

        # Приоритизируем все задачи
        prioritized = self.prioritizer.prioritize_tasks(tasks)

        # Фильтруем только доступные (нет блокирующих зависимостей)
        available_tasks = self._filter_available_tasks(prioritized, tasks)

        # Подбираем оптимальный набор
        recommended = self._select_optimal_set(available_tasks, available_hours)

        # Формируем результат
        total_hours = sum(
            r['task'].metadata.estimated_hours or 2
            for r in recommended
        )

        return {
            'recommended': recommended,
            'total_tasks': len(recommended),
            'total_hours': total_hours,
            'available_hours': available_hours,
            'remaining_hours': max(0, available_hours - total_hours)
        }

    def _filter_available_tasks(
        self,
        prioritized: List[Dict],
        all_tasks: List[Task]
    ) -> List[Dict]:
        """Фильтровать только доступные задачи (нет блокеров)"""
        available = []

        for item in prioritized:
            task = item['task']

            # Пропускаем завершенные
            if task.status in [Status.DONE, Status.CANCELLED]:
                continue

            # Проверяем зависимости
            if task.dependencies:
                # Проверяем что все зависимости завершены
                blocking_deps = [
                    dep_id for dep_id in task.dependencies
                    if any(
                        t.id == dep_id and t.status != Status.DONE
                        for t in all_tasks
                    )
                ]

                if blocking_deps:
                    # Есть незавершенные зависимости, задача заблокирована
                    continue

            available.append(item)

        return available

    def _select_optimal_set(
        self,
        available_tasks: List[Dict],
        available_hours: float
    ) -> List[Dict]:
        """
        Выбрать оптимальный набор задач

        Жадный алгоритм: берем задачи по убыванию score,
        пока помещаемся в available_hours
        """
        selected = []
        remaining_hours = available_hours

        # Уже отсортировано по score (убыванию)
        for item in available_tasks:
            task = item['task']

            # Оценка времени (если не указана, предполагаем 2 часа)
            estimated = task.metadata.estimated_hours or 2.0

            # Если помещается в оставшееся время
            if estimated <= remaining_hours:
                selected.append(item)
                remaining_hours -= estimated

                # Ограничиваем макс количество задач
                if len(selected) >= Config.MAX_RECOMMENDED_TASKS:
                    break

        return selected

    def get_summary_text(self, recommendation: Dict) -> str:
        """Получить текстовое резюме рекомендаций"""
        lines = []

        lines.append(f"Доступно времени: {recommendation['available_hours']}ч")
        lines.append(f"Рекомендовано задач: {recommendation['total_tasks']}")
        lines.append(f"Ожидаемое время: {recommendation['total_hours']:.1f}ч")
        lines.append(f"Останется: {recommendation['remaining_hours']:.1f}ч")

        return "\n".join(lines)
