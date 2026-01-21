"""
AI-генератор описаний для worklogs на основе контекста

Анализирует:
- Git commits за период работы
- Тип задачи (bug fix, feature, documentation)
- Jira issue данные
- Контекст проекта (РЭМД, КУ ФЭР, etc.)
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import subprocess
import os
import sys
import json
import argparse

# Добавляем родительскую директорию в path для импорта
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.claude_client import ClaudeClient
from utils.logging_config import get_logger

logger = get_logger('worklog_generator')


class WorklogDescriptionGenerator:
    """
    Генератор описаний worklogs с использованием Claude AI.

    Анализирует:
    - Git commits за период работы
    - Тип задачи (bug fix, feature, documentation)
    - Jira issue данные
    - Контекст проекта (РЭМД, КУ ФЭР, etc.)
    """

    def __init__(self, claude_client: Optional[ClaudeClient] = None):
        self.claude = claude_client or ClaudeClient()

    def generate(
        self,
        task_title: str,
        jira_key: Optional[str],
        duration_minutes: int,
        start_time: datetime,
        end_time: datetime,
        git_repo_path: Optional[str] = None
    ) -> str:
        """
        Генерация описания worklog.

        Args:
            task_title: Название задачи
            jira_key: Jira issue key (EGISZREMD-123)
            duration_minutes: Длительность работы
            start_time: Начало работы
            end_time: Конец работы
            git_repo_path: Путь к git репозиторию (для анализа коммитов)

        Returns:
            Сгенерированное описание worklog (1-3 предложения)
        """
        logger.info(f"Generating worklog description for {jira_key or task_title}")

        # Собираем контекст
        context = self._gather_context(
            task_title, jira_key, duration_minutes,
            start_time, end_time, git_repo_path
        )

        # Формируем промпт
        prompt = self._build_prompt(context)

        # Генерируем с Claude
        try:
            description = self.claude.send_message(
                prompt=prompt,
                system_prompt=self._get_system_prompt(),
                temperature=0.7,
                max_tokens=200
            )

            # Очистка и валидация
            description = self._clean_description(description)

            logger.info(f"Generated description: {description[:50]}...")
            return description

        except Exception as e:
            logger.error(f"Failed to generate description: {e}")
            # Fallback на базовое описание
            return self._fallback_description(task_title, duration_minutes)

    def _gather_context(
        self,
        task_title: str,
        jira_key: Optional[str],
        duration_minutes: int,
        start_time: datetime,
        end_time: datetime,
        git_repo_path: Optional[str]
    ) -> Dict[str, Any]:
        """Сбор контекста для генерации"""
        context = {
            'task_title': task_title,
            'jira_key': jira_key,
            'duration_minutes': duration_minutes,
            'duration_hours': round(duration_minutes / 60, 1),
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
            'project': self._detect_project(jira_key, task_title),
        }

        # Git commits за период
        if git_repo_path and os.path.exists(git_repo_path):
            commits = self._get_git_commits(
                git_repo_path, start_time, end_time
            )
            context['git_commits'] = commits
            context['files_changed'] = self._extract_changed_files(commits)

        # Jira issue данные (если доступно)
        # TODO: Интеграция с Jira API через Electron
        # if jira_key:
        #     jira_data = self._fetch_jira_issue(jira_key)
        #     if jira_data:
        #         context['jira_summary'] = jira_data.get('summary')
        #         context['jira_type'] = jira_data.get('issuetype', {}).get('name')
        #         context['jira_status'] = jira_data.get('status', {}).get('name')

        return context

    def _get_git_commits(
        self,
        repo_path: str,
        start_time: datetime,
        end_time: datetime
    ) -> List[Dict[str, str]]:
        """Получение Git commits за период"""
        try:
            # Git log с форматированием
            cmd = [
                'git', 'log',
                f'--since={start_time.isoformat()}',
                f'--until={end_time.isoformat()}',
                '--pretty=format:%h|%s|%an|%ad',
                '--date=iso',
                '--no-merges'
            ]

            result = subprocess.run(
                cmd,
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                logger.warning(f"Git log failed: {result.stderr}")
                return []

            commits = []
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('|')
                if len(parts) >= 4:
                    commits.append({
                        'hash': parts[0],
                        'message': parts[1],
                        'author': parts[2],
                        'date': parts[3]
                    })

            logger.info(f"Found {len(commits)} commits in time range")
            return commits

        except Exception as e:
            logger.error(f"Failed to get git commits: {e}")
            return []

    def _extract_changed_files(self, commits: List[Dict[str, str]]) -> List[str]:
        """Извлечение измененных файлов из коммитов"""
        # Простое извлечение из commit messages
        files = set()
        for commit in commits:
            msg = commit['message'].lower()
            # Ищем упоминания файлов (простая эвристика)
            if '.py' in msg or '.ts' in msg or '.tsx' in msg:
                # Можно улучшить regex для точного извлечения
                pass
        return list(files)

    def _detect_project(self, jira_key: Optional[str], task_title: str) -> str:
        """Определение проекта (РЭМД, КУ ФЭР, etc.)"""
        if jira_key:
            if 'EGISZREMD' in jira_key or 'REMD' in jira_key:
                return 'РЭМД'
            elif 'KUFER' in jira_key or 'FER' in jira_key:
                return 'КУ ФЭР'
            elif 'DEVOPS' in jira_key:
                return 'DevOps'

        # Fallback на анализ title
        title_lower = task_title.lower()
        if 'рэмд' in title_lower or 'сэмд' in title_lower:
            return 'РЭМД'
        elif 'фэр' in title_lower:
            return 'КУ ФЭР'

        return 'Общие'

    def _build_prompt(self, context: Dict[str, Any]) -> str:
        """Формирование промпта для Claude"""
        prompt_parts = [
            f"Задача: {context['task_title']}",
        ]

        if context.get('jira_key'):
            prompt_parts.append(f"Jira: {context['jira_key']}")

        if context.get('jira_summary'):
            prompt_parts.append(f"Описание Jira: {context['jira_summary']}")

        prompt_parts.append(f"Время работы: {context['duration_hours']} часов ({context['duration_minutes']} минут)")
        prompt_parts.append(f"Проект: {context['project']}")

        if context.get('git_commits'):
            prompt_parts.append(f"\nGit commits за период:")
            for commit in context['git_commits'][:5]:  # Первые 5
                prompt_parts.append(f"- {commit['message']}")

        prompt_parts.append("\nСгенерируй краткое описание worklog для Jira (1-3 предложения).")
        prompt_parts.append("Опиши ЧТО было сделано, избегай общих фраз.")
        prompt_parts.append("Формат: деловой, конкретный, на русском языке.")

        return '\n'.join(prompt_parts)

    def _get_system_prompt(self) -> str:
        """System prompt для Claude"""
        return """Ты - ассистент для генерации описаний worklogs в Jira.
Твоя задача - создавать краткие, информативные описания того, что было сделано.

Правила:
1. Описание должно быть 1-3 предложения
2. Конкретные действия (анализ, разработка, ревью, обсуждение, тестирование)
3. Избегай общих фраз типа "работа над задачей"
4. Используй профессиональный деловой тон
5. На русском языке
6. Без эмодзи и неформальных выражений

Хорошие примеры:
- "Анализ требований для интеграции с СЭМД, обсуждение архитектуры с командой, подготовка технической спецификации"
- "Исправление бага с загрузкой документов, код-ревью PR#142, деплой на тестовый стенд"
- "Встреча с заказчиком по уточнению требований к ФЛК, обновление документации"

Плохие примеры:
- "Работа над задачей" (слишком общо)
- "Делал разные вещи" (не информативно)
- "Coding" (не на русском)
"""

    def _clean_description(self, description: str) -> str:
        """Очистка и валидация описания"""
        # Удаление лишних пробелов
        description = ' '.join(description.split())

        # Удаление кавычек в начале/конце (если Claude добавил)
        description = description.strip('"\'')

        # Ограничение длины
        if len(description) > 500:
            description = description[:497] + '...'

        return description

    def _fallback_description(self, task_title: str, duration_minutes: int) -> str:
        """Fallback описание если AI недоступен"""
        hours = round(duration_minutes / 60, 1)
        return f"Работа над задачей: {task_title[:50]} ({hours}ч)"


# ============================================================================
# API Endpoint для Electron
# ============================================================================

def generate_worklog_description_api(
    task_title: str,
    jira_key: Optional[str] = None,
    duration_minutes: int = 60,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    git_repo_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    API endpoint для генерации описания worklog.

    Может вызываться из Electron через subprocess или HTTP.

    Returns:
        {
            "success": bool,
            "description": str,
            "error": Optional[str]
        }
    """
    try:
        generator = WorklogDescriptionGenerator()

        # Парсинг времени
        start = datetime.fromisoformat(start_time) if start_time else datetime.now()
        end = datetime.fromisoformat(end_time) if end_time else datetime.now()

        description = generator.generate(
            task_title=task_title,
            jira_key=jira_key,
            duration_minutes=duration_minutes,
            start_time=start,
            end_time=end,
            git_repo_path=git_repo_path
        )

        return {
            "success": True,
            "description": description
        }

    except Exception as e:
        logger.error(f"API error: {e}", exc_info=True)
        return {
            "success": False,
            "description": "",
            "error": str(e)
        }


# ============================================================================
# CLI Interface
# ============================================================================

def main():
    """CLI interface для тестирования"""
    parser = argparse.ArgumentParser(description='Generate worklog description')
    parser.add_argument('--task-title', required=True, help='Task title')
    parser.add_argument('--jira-key', default=None, help='Jira issue key')
    parser.add_argument('--duration', type=int, default=60, help='Duration in minutes')
    parser.add_argument('--start-time', default=None, help='Start time (ISO format)')
    parser.add_argument('--end-time', default=None, help='End time (ISO format)')
    parser.add_argument('--git-repo', default=None, help='Path to git repository')

    args = parser.parse_args()

    result = generate_worklog_description_api(
        task_title=args.task_title,
        jira_key=args.jira_key,
        duration_minutes=args.duration,
        start_time=args.start_time,
        end_time=args.end_time,
        git_repo_path=args.git_repo
    )

    # Вывод JSON для Electron
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
