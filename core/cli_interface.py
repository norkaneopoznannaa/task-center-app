"""CLI интерфейс для Task Center"""
import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from datetime import datetime
from typing import List

from core.models import Task, Status, Priority, TaskType, Complexity
from core.storage import TaskStorage
from parsers.task_parser import TaskParser
from config import Config

console = Console()


@click.group()
def cli():
    """Task Center - AI-помощник для управления задачами проекта РЭМД"""
    pass


@cli.command()
def add():
    """Добавить задачи из списка"""
    console.print("[bold green]Добавление новых задач[/bold green]\n")

    console.print("Вставьте список задач (закончите пустой строкой):")
    lines = []
    while True:
        try:
            line = input()
            if not line:
                break
            lines.append(line)
        except EOFError:
            break

    raw_text = "\n".join(lines)

    if not raw_text.strip():
        console.print("[yellow]Список задач пуст[/yellow]")
        return

    # Парсинг задач
    parser = TaskParser()
    tasks = parser.parse_task_list(raw_text)

    if not tasks:
        console.print("[yellow]Не удалось распознать задачи[/yellow]")
        return

    console.print(f"\n[green]Распознано задач: {len(tasks)}[/green]\n")

    # AI классификация через Claude Code (не через API)
    ai_enabled = False
    console.print("[cyan]Для классификации используйте: python task_manager.py classify_request[/cyan]\n")

    # Отображение распознанных задач и запрос подтверждения
    for i, task in enumerate(tasks, 1):
        # Формируем информацию для отображения
        panel_content = f"[bold]{task.title}[/bold]\n\n"

        # Основная информация
        panel_content += f"[yellow]Тип:[/yellow] {task.task_type.value}\n"
        panel_content += f"[yellow]Сложность:[/yellow] {task.complexity.value}\n"
        panel_content += f"[yellow]Приоритет:[/yellow] {task.priority.name}"

        # Оценка времени если есть
        if task.metadata.estimated_hours:
            panel_content += f" | [yellow]Оценка:[/yellow] {task.metadata.estimated_hours}ч"

        panel_content += "\n\n"

        # Jira и упоминания
        panel_content += f"[cyan]Jira:[/cyan] {', '.join(ref.ticket_id for ref in task.jira_references) if task.jira_references else '-'}\n"
        panel_content += f"[cyan]Упоминания:[/cyan] {', '.join(p.name for p in task.mentions) if task.mentions else '-'}"

        # AI информация если была классификация
        if task.ai_classification_confidence > 0:
            panel_content += f"\n\n[dim]AI уверенность: {task.ai_classification_confidence:.0%}[/dim]"
            if task.ai_recommendations.get('reasoning'):
                reasoning = task.ai_recommendations['reasoning'][:100]
                panel_content += f"\n[dim]{reasoning}...[/dim]"

        # Цвет границы в зависимости от приоритета
        border_color = "red" if task.priority in [Priority.CRITICAL, Priority.HIGH] else "cyan"

        console.print(Panel(
            panel_content,
            title=f"Задача #{i}",
            border_style=border_color
        ))

    if not Confirm.ask("\nСохранить эти задачи?", default=True):
        console.print("[yellow]Отменено[/yellow]")
        return

    # Сохранение
    storage = TaskStorage()
    existing_tasks = storage.load_tasks()
    all_tasks = existing_tasks + tasks
    storage.save_tasks(all_tasks)

    # История
    for task in tasks:
        storage.save_history({
            'task_id': task.id,
            'action': 'create',
            'changes': {'status': 'NEW'},
            'timestamp': datetime.now().isoformat()
        })

    console.print(f"\n[bold green]OK: Сохранено {len(tasks)} задач[/bold green]")


@cli.command()
@click.option('--status', default=None, help='Фильтр по статусу (новая, в работе, завершена)')
@click.option('--priority', default=None, help='Фильтр по приоритету (CRITICAL, HIGH, MEDIUM, LOW)')
def list(status, priority):
    """Показать все задачи"""
    storage = TaskStorage()
    tasks = storage.load_tasks()

    if not tasks:
        console.print("[yellow]Нет задач. Используйте 'task_manager.py add' для добавления.[/yellow]")
        return

    # Фильтрация
    if status:
        tasks = [t for t in tasks if t.status.value.lower() == status.lower()]

    if priority:
        tasks = [t for t in tasks if t.priority.name.upper() == priority.upper()]

    # Таблица
    table = Table(title=f"Список задач ({len(tasks)})")
    table.add_column("ID", style="cyan", width=10)
    table.add_column("Название", style="white", width=40)
    table.add_column("Тип", style="magenta", width=15)
    table.add_column("Приоритет", style="yellow", width=10)
    table.add_column("Статус", style="green", width=12)
    table.add_column("Дедлайн", style="red", width=12)

    for task in tasks:
        # Цвет статуса
        status_style = "green" if task.status == Status.DONE else "yellow"

        table.add_row(
            task.id[:8],
            task.title[:38] + "..." if len(task.title) > 38 else task.title,
            task.task_type.value[:13],
            task.priority.name,
            f"[{status_style}]{task.status.value}[/{status_style}]",
            task.deadline.strftime("%d.%m.%Y") if task.deadline else "-"
        )

    console.print(table)


@cli.command()
@click.argument('task_id')
def show(task_id):
    """Показать детали задачи"""
    storage = TaskStorage()
    task = storage.get_task_by_id(task_id)

    if not task:
        console.print(f"[red]Задача '{task_id}' не найдена[/red]")
        return

    # Детальная информация
    details = f"""[bold]{task.title}[/bold]

[yellow]Описание:[/yellow]
{task.description}

[yellow]Информация:[/yellow]
ID: {task.id}
Тип: {task.task_type.value}
Сложность: {task.complexity.value}
Приоритет: {task.priority.name}
Статус: {task.status.value}

[yellow]Jira:[/yellow]
{', '.join(ref.ticket_id for ref in task.jira_references) if task.jira_references else 'Нет'}

[yellow]Упоминания:[/yellow]
{', '.join(f"{p.name} ({p.mention_context})" for p in task.mentions) if task.mentions else 'Нет'}

[yellow]Временные метки:[/yellow]
Создано: {task.metadata.created_at.strftime("%d.%m.%Y %H:%M")}
Обновлено: {task.metadata.updated_at.strftime("%d.%m.%Y %H:%M")}
Дедлайн: {task.deadline.strftime("%d.%m.%Y") if task.deadline else 'Не установлен'}
Оценка: {task.metadata.estimated_hours if task.metadata.estimated_hours else '-'} часов
"""

    # Добавляем AI информацию если есть
    if task.ai_classification_confidence > 0:
        details += f"\n[yellow]AI Анализ:[/yellow]\n"
        details += f"Уверенность: {task.ai_classification_confidence:.0%}\n"
        if task.ai_recommendations.get('reasoning'):
            details += f"Объяснение: {task.ai_recommendations['reasoning']}\n"
        if task.context.key_terms:
            details += f"Ключевые термины: {', '.join(task.context.key_terms)}\n"
        if task.context.related_systems:
            details += f"Связанные системы: {', '.join(task.context.related_systems)}\n"

    console.print(Panel(details, border_style="cyan"))


@cli.command()
@click.argument('task_id')
@click.argument('new_status')
def status(task_id, new_status):
    """Обновить статус задачи

    Доступные статусы: NEW, IN_PROGRESS, BLOCKED, REVIEW, DONE, CANCELLED
    """
    storage = TaskStorage()
    task = storage.get_task_by_id(task_id)

    if not task:
        console.print(f"[red]Задача '{task_id}' не найдена[/red]")
        return

    # Проверка валидности статуса
    try:
        new_status_upper = new_status.upper()
        new_status_enum = Status[new_status_upper]
    except KeyError:
        console.print(f"[red]Неверный статус '{new_status}'. Доступные: NEW, IN_PROGRESS, BLOCKED, REVIEW, DONE, CANCELLED[/red]")
        return

    # Обновление
    old_status = task.status
    task.status = new_status_enum
    task.metadata.updated_at = datetime.now()
    task.metadata.last_status_change = datetime.now()

    storage.update_task(task)

    # История
    storage.save_history({
        'task_id': task.id,
        'action': 'status_change',
        'changes': {
            'old_status': old_status.value,
            'new_status': task.status.value
        }
    })

    console.print(f"[green]OK: Статус задачи обновлен: {old_status.value} -> {task.status.value}[/green]")


@cli.command()
def stats():
    """Показать статистику по задачам"""
    storage = TaskStorage()
    statistics = storage.get_statistics()

    stats_text = f"""[bold]Статистика задач[/bold]

[yellow]Всего задач:[/yellow] {statistics['total_tasks']}

[yellow]По статусам:[/yellow]
{chr(10).join(f"  {status}: {count}" for status, count in statistics.get('by_status', {}).items())}

[yellow]По приоритетам:[/yellow]
{chr(10).join(f"  {priority}: {count}" for priority, count in statistics.get('by_priority', {}).items())}

[yellow]По типам:[/yellow]
{chr(10).join(f"  {task_type}: {count}" for task_type, count in statistics.get('by_type', {}).items())}

[yellow]С дедлайном:[/yellow] {statistics.get('with_deadline', 0)}
[yellow]Просрочено:[/yellow] {statistics.get('overdue', 0)}
"""

    console.print(Panel(stats_text, border_style="cyan"))


@cli.command()
@click.argument('task_id')
@click.confirmation_option(prompt='Вы уверены что хотите удалить эту задачу?')
def delete(task_id):
    """Удалить задачу"""
    storage = TaskStorage()
    task = storage.get_task_by_id(task_id)

    if not task:
        console.print(f"[red]Задача '{task_id}' не найдена[/red]")
        return

    storage.delete_task(task.id)

    # История
    storage.save_history({
        'task_id': task.id,
        'action': 'delete',
        'changes': {'title': task.title}
    })

    console.print(f"[green]OK: Задача '{task.title}' удалена[/green]")


@cli.command()
def classify_request():
    """Подготовить задачи для классификации через Claude Code"""
    storage = TaskStorage()
    tasks = storage.load_tasks()

    # Фильтруем неклассифицированные (тип = Неизвестно)
    unclassified = [t for t in tasks if t.task_type == TaskType.UNKNOWN or t.ai_classification_confidence == 0]

    if not unclassified:
        console.print("[yellow]Все задачи уже классифицированы![/yellow]")
        console.print("Используйте 'task_manager.py list' для просмотра")
        return

    console.print(f"\n[cyan]Найдено {len(unclassified)} задач для классификации[/cyan]\n")

    # Создаем файл запроса
    request_file = Config.DATA_DIR / "classification_request.txt"

    with open(request_file, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("ЗАДАЧИ ДЛЯ КЛАССИФИКАЦИИ ЧЕРЕЗ CLAUDE CODE\n")
        f.write("=" * 70 + "\n\n")

        for i, task in enumerate(unclassified, 1):
            f.write(f"\nЗАДАЧА #{i}\n")
            f.write(f"ID: {task.id}\n")
            f.write(f"Название: {task.title}\n")
            f.write(f"Описание: {task.description}\n")

            if task.jira_references:
                jira_ids = ', '.join(ref.ticket_id for ref in task.jira_references)
                f.write(f"Jira: {jira_ids}\n")

            if task.mentions:
                mentions = ', '.join(p.name for p in task.mentions)
                f.write(f"Упоминания: {mentions}\n")

            f.write("-" * 70 + "\n")

    console.print(f"[green]OK: Файл создан: {request_file}[/green]\n")

    console.print(Panel(
        f"""[bold cyan]Следующий шаг:[/bold cyan]

1. В Claude Code напишите:
   [yellow]"Прочитай файл {request_file} и проклассифицируй эти задачи"[/yellow]

2. Claude Code проанализирует задачи и создаст файл с результатами

3. Затем выполните:
   [yellow]python task_manager.py classify_apply[/yellow]

[dim]Или просто продолжите диалог с Claude Code прямо здесь![/dim]
""",
        title="Инструкция",
        border_style="green"
    ))


@cli.command()
def classify_apply():
    """Применить результаты классификации от Claude Code"""
    result_file = Config.DATA_DIR / "classification_results.json"

    if not result_file.exists():
        console.print(f"[red]Файл результатов не найден: {result_file}[/red]")
        console.print("[yellow]Сначала попросите Claude Code создать файл с результатами[/yellow]")
        return

    import json

    try:
        with open(result_file, 'r', encoding='utf-8') as f:
            results = json.load(f)

        storage = TaskStorage()
        tasks = storage.load_tasks()

        updated_count = 0

        for result in results:
            task_id = result.get('task_id')
            task = next((t for t in tasks if t.id == task_id), None)

            if not task:
                continue

            # Применяем классификацию
            # Тип
            task_type_str = result.get('task_type', '')
            for tt in TaskType:
                if tt.value == task_type_str:
                    task.task_type = tt
                    break

            # Сложность
            complexity_str = result.get('complexity', '')
            for c in Complexity:
                if c.value == complexity_str:
                    task.complexity = c
                    break

            # Приоритет
            priority_num = result.get('priority', 3)
            if priority_num == 5:
                task.priority = Priority.CRITICAL
            elif priority_num == 4:
                task.priority = Priority.HIGH
            elif priority_num == 3:
                task.priority = Priority.MEDIUM
            elif priority_num == 2:
                task.priority = Priority.LOW
            else:
                task.priority = Priority.BACKLOG

            # Дополнительная информация
            if result.get('estimated_hours'):
                task.metadata.estimated_hours = result['estimated_hours']

            if result.get('key_terms'):
                task.context.key_terms = result['key_terms']

            if result.get('related_systems'):
                task.context.related_systems = result['related_systems']

            task.ai_classification_confidence = result.get('confidence', 0.9)
            task.ai_recommendations = {
                'reasoning': result.get('reasoning', ''),
                'source': 'claude_code'
            }

            updated_count += 1

        # Сохраняем
        storage.save_tasks(tasks)

        console.print(f"\n[green]OK: Обновлено задач: {updated_count}[/green]")
        console.print("\nИспользуйте 'python task_manager.py list' для просмотра")

    except json.JSONDecodeError as e:
        console.print(f"[red]Ошибка чтения JSON: {e}[/red]")
    except Exception as e:
        console.print(f"[red]Ошибка: {e}[/red]")


@cli.command()
@click.option('--top', default=10, help='Показать топ N задач')
def analyze(top):
    """Анализ и приоритизация всех задач"""
    from analysis.prioritizer import TaskPrioritizer

    storage = TaskStorage()
    tasks = storage.load_tasks()

    if not tasks:
        console.print("[yellow]Нет задач для анализа[/yellow]")
        return

    prioritizer = TaskPrioritizer()
    prioritized = prioritizer.prioritize_tasks(tasks)

    if not prioritized:
        console.print("[yellow]Нет активных задач[/yellow]")
        return

    # Ограничиваем вывод
    to_show = prioritized[:top]

    # Таблица приоритетов
    table = Table(title=f"Анализ приоритетов (топ-{len(to_show)})")
    table.add_column("Score", style="bold", width=6)
    table.add_column("Уровень", width=15)
    table.add_column("Задача", width=35)
    table.add_column("Тип", width=15)
    table.add_column("Приоритет", width=10)

    for item in to_show:
        task = item['task']
        score = item['score']
        level = item['importance_level']
        color = item['importance_color']

        table.add_row(
            f"{score:.1f}",
            f"[{color}]{level}[/{color}]",
            task.title[:33] + "..." if len(task.title) > 33 else task.title,
            task.task_type.value[:13],
            task.priority.name
        )

    console.print(table)

    # Рекомендации
    console.print(f"\n[bold]Рекомендации:[/bold]\n")
    for item in to_show[:3]:
        task = item['task']
        score = item['score']
        recommendation = prioritizer.get_recommendation_text(score)

        console.print(f"[cyan]{task.title}[/cyan]")
        console.print(f"  Score: {score:.1f} | {recommendation}\n")


@cli.command()
@click.option('--hours', default=8.0, help='Доступные часы')
def recommend(hours):
    """Рекомендации: что делать сегодня"""
    from analysis.recommendation_engine import RecommendationEngine

    storage = TaskStorage()
    tasks = storage.load_tasks()

    if not tasks:
        console.print("[yellow]Нет задач[/yellow]")
        return

    engine = RecommendationEngine()
    result = engine.recommend_for_today(tasks, hours)

    if not result['recommended']:
        console.print("[yellow]Нет доступных задач для рекомендации[/yellow]")
        console.print("Возможно все задачи заблокированы зависимостями")
        return

    # Резюме
    summary_text = f"""[bold]План на сегодня[/bold]

[yellow]Доступно времени:[/yellow] {result['available_hours']}ч
[yellow]Рекомендовано задач:[/yellow] {result['total_tasks']}
[yellow]Ожидаемое время:[/yellow] {result['total_hours']:.1f}ч
[yellow]Останется:[/yellow] {result['remaining_hours']:.1f}ч
"""

    console.print(Panel(summary_text, border_style="green"))

    # Список рекомендованных задач
    console.print("\n[bold cyan]Задачи на сегодня:[/bold cyan]\n")

    for i, item in enumerate(result['recommended'], 1):
        task = item['task']
        score = item['score']
        estimated = task.metadata.estimated_hours or 2.0

        task_info = f"""[bold]{i}. {task.title}[/bold]

[yellow]Тип:[/yellow] {task.task_type.value}
[yellow]Приоритет:[/yellow] {task.priority.name} | [yellow]Score:[/yellow] {score:.1f}
[yellow]Оценка времени:[/yellow] {estimated}ч
"""

        if task.jira_references:
            jira_ids = ', '.join(ref.ticket_id for ref in task.jira_references)
            task_info += f"[yellow]Jira:[/yellow] {jira_ids}\n"

        console.print(Panel(task_info, border_style="cyan"))


if __name__ == '__main__':
    cli()
