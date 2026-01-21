"""Парсер задач в свободной форме"""
import re
from typing import List, Optional

from core.models import Task, JiraReference, Person


class TaskParser:
    """Парсер задач в свободной форме"""

    # Регулярные выражения для извлечения информации
    # Поддерживаем разные форматы Jira: EGISZREMD-1234, REMD-5678, AN-1234
    JIRA_PATTERN = r'([A-Z]{2,}-\d+)|https?://jira\.[\w\./]+/browse/([A-Z]{2,}-\d+)'

    # Упоминания людей: "от Максима", "Задача Саиды", "связаться с Петровым"
    MENTION_PATTERN = r'(?:от|задача)\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)|(?:связаться с|согласовать с|передать)\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)'

    # Префикс с номером в начале строки: "1. ", "1) ", "10. "
    NUMBER_PREFIX_PATTERN = r'^\s*\d+[\.)]\s*'

    # Ключевые слова срочности
    URGENCY_KEYWORDS = ['срочно', 'критично', 'блокер', 'asap', 'сегодня', 'горит']

    def parse_task_list(self, text: str) -> List[Task]:
        """
        Парсинг списка задач из текста

        Пример входных данных:
        1. Проанализировать требования к ФЛК EGISZREMD-15263
        2. Обновить документацию по интеграции с ГИСЗ - связаться с Петровым
        3. Исправить баг с валидацией СНИЛСа - СРОЧНО!
        """
        lines = text.strip().split('\n')
        tasks = []

        for line in lines:
            line = line.strip()
            if not line:
                continue

            task = self._parse_single_task(line)
            if task:
                tasks.append(task)

        return tasks

    def _parse_single_task(self, text: str) -> Optional[Task]:
        """Парсинг одной задачи"""
        # Удаление номера в начале
        clean_text = re.sub(self.NUMBER_PREFIX_PATTERN, '', text)

        if not clean_text:
            return None

        task = Task()
        task.original_text = text

        # Извлечение заголовка (первое предложение или до первой точки)
        title_match = re.match(r'^([^\.]+)', clean_text)
        if title_match:
            task.title = title_match.group(1).strip()
        else:
            task.title = clean_text[:100]  # Первые 100 символов

        task.description = clean_text

        # Извлечение Jira ссылок
        task.jira_references = self._extract_jira_refs(clean_text)

        # Извлечение упоминаний людей
        task.mentions = self._extract_mentions(clean_text)

        # Определение срочности по ключевым словам
        if self._is_urgent(clean_text):
            from core.models import Priority
            task.priority = Priority.HIGH

        return task

    def _extract_jira_refs(self, text: str) -> List[JiraReference]:
        """Извлечение Jira ссылок"""
        refs = []

        for match in re.finditer(self.JIRA_PATTERN, text, re.IGNORECASE):
            full_match = match.group(0)

            if full_match.startswith('http'):
                # URL
                ticket_id = match.group(2) if match.lastindex >= 2 and match.group(2) else None
                if ticket_id:
                    refs.append(JiraReference(
                        ticket_id=ticket_id,
                        url=full_match,
                        project=ticket_id.split('-')[0] if '-' in ticket_id else "REMD"
                    ))
            else:
                # Просто ID (группа 1)
                ticket_id = match.group(1)
                if ticket_id:
                    refs.append(JiraReference(
                        ticket_id=ticket_id,
                        project=ticket_id.split('-')[0] if '-' in ticket_id else "REMD"
                    ))

        return refs

    def _extract_mentions(self, text: str) -> List[Person]:
        """Извлечение упоминаний людей"""
        mentions = []

        for match in re.finditer(self.MENTION_PATTERN, text):
            name = match.group(1) or match.group(2)
            if name:
                # Определение контекста
                context = None
                matched_text = match.group(0).lower()
                if 'согласовать' in matched_text:
                    context = 'согласование'
                elif 'связаться' in matched_text:
                    context = 'координация'
                elif 'передать' in matched_text:
                    context = 'делегирование'
                elif 'от' in matched_text:
                    context = 'постановщик'
                elif 'задача' in matched_text:
                    context = 'автор'

                mentions.append(Person(
                    name=name.strip(),
                    mention_context=context
                ))

        return mentions

    def _is_urgent(self, text: str) -> bool:
        """Проверка на срочность по ключевым словам"""
        text_lower = text.lower()
        return any(keyword in text_lower for keyword in self.URGENCY_KEYWORDS)

    def extract_keywords(self, text: str) -> List[str]:
        """
        Извлечение ключевых слов и аббревиатур РЭМД

        Используется для поиска в документации
        """
        # РЭМД-специфичные аббревиатуры
        remd_abbrs = ["ФЛК", "СЭМД", "ГИСЗ", "РЭМД", "МИС", "ЕГИСЗ", "ЭМД", "СНИЛС"]

        found_keywords = []

        # Поиск аббревиатур (регистронезависимый)
        text_upper = text.upper()
        for abbr in remd_abbrs:
            if abbr in text_upper:
                found_keywords.append(abbr)

        # Дополнительные ключевые слова (существительные в именительном падеже)
        # Простая эвристика: слова длиной > 4 символов, начинающиеся с заглавной
        words = re.findall(r'\b[А-ЯЁ][а-яё]{3,}\b', text)
        found_keywords.extend(words[:5])  # Топ-5 слов

        return list(set(found_keywords))  # Уникальные

    def clean_text(self, text: str) -> str:
        """Очистка текста от лишних символов"""
        # Удаление множественных пробелов
        text = re.sub(r'\s+', ' ', text)
        # Удаление пробелов в начале и конце
        text = text.strip()
        return text
