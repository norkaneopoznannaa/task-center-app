# Автоматизация логирования времени в Jira Server: Спецификация для Task Center

> **Цель документа**: Техническая спецификация для реализации автоматического трекинга времени в локальном приложении Task Center с интеграцией через Jira Server REST API.

---

## Содержание

1. [Обзор решения](#1-обзор-решения)
2. [Jira Server REST API: эндпоинты и аутентификация](#2-jira-server-rest-api-эндпоинты-и-аутентификация)
3. [Webhooks для автоматизации по статусам](#3-webhooks-для-автоматизации-по-статусам)
4. [Детекция простоя (Idle Detection)](#4-детекция-простоя-idle-detection)
5. [Паттерн Heartbeat для непрерывного трекинга](#5-паттерн-heartbeat-для-непрерывного-трекинга)
6. [Архитектура конечного автомата таймера](#6-архитектура-конечного-автомата-таймера)
7. [Best Practices от Tempo, Toggl, WakaTime, Clockwork](#7-best-practices-от-tempo-toggl-wakatime-clockwork)
8. [Схема локальной базы данных (SQLite)](#8-схема-локальной-базы-данных-sqlite)
9. [Очередь синхронизации и офлайн-работа](#9-очередь-синхронизации-и-офлайн-работа)
10. [Обработка переключения контекста](#10-обработка-переключения-контекста)
11. [Решения для edge-кейсов](#11-решения-для-edge-кейсов)
12. [Безопасность и хранение credentials](#12-безопасность-и-хранение-credentials)
13. [Рекомендуемый технологический стек](#13-рекомендуемый-технологический-стек)
14. [Чек-лист реализации](#14-чек-лист-реализации)

---

## 1. Обзор решения

**Автоматизация логирования времени через статус-переходы в сочетании с детекцией простоя позволяет достичь 80%+ автоматизации** без ручного старта/стопа таймеров.

### Ключевые принципы

| Принцип | Описание |
|---------|----------|
| **Event-driven** | Таймер управляется событиями Jira (смена статуса), а не ручными действиями |
| **Offline-first** | Все данные сначала сохраняются локально, синхронизация — фоновый процесс |
| **Heartbeat-based** | Непрерывная активность фиксируется периодическими "пульсами", не дискретными событиями |
| **Graceful degradation** | При проблемах с сетью приложение продолжает работать |

### Проблема отвлечений: три стратегии решения

1. **Idle Detection** — автоматическая пауза при отсутствии активности мыши/клавиатуры
2. **Window Tracking** — отслеживание активного окна для детекции смены контекста
3. **Smart Prompts** — интеллектуальные подсказки при возврате из простоя

---

## 2. Jira Server REST API: эндпоинты и аутентификация

### 2.1 Worklog API

**Базовый URL**: `/rest/api/2/issue/{issueIdOrKey}/worklog`

#### Создание worklog

```http
POST /rest/api/2/issue/PROJ-123/worklog?adjustEstimate=auto
Content-Type: application/json
Authorization: Bearer <PAT_TOKEN>

{
  "timeSpentSeconds": 3600,
  "started": "2026-01-17T09:00:00.000+0300",
  "comment": "Реализация функционала X"
}
```

**Параметры запроса:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `timeSpentSeconds` | integer | Время в секундах (альтернатива: `timeSpent` в формате "1h 30m") |
| `started` | ISO 8601 | Время начала работы |
| `comment` | string | Комментарий к записи (опционально) |
| `adjustEstimate` | query | Как корректировать оценку: `auto`, `leave`, `new`, `manual` |

**Успешный ответ (201 Created):**

```json
{
  "id": "10023",
  "self": "https://jira.company.com/rest/api/2/issue/PROJ-123/worklog/10023",
  "author": { "key": "ivan.petrov", "displayName": "Иван Петров" },
  "updateAuthor": { "key": "ivan.petrov" },
  "created": "2026-01-17T12:00:00.000+0300",
  "updated": "2026-01-17T12:00:00.000+0300",
  "started": "2026-01-17T09:00:00.000+0300",
  "timeSpent": "1h",
  "timeSpentSeconds": 3600
}
```

#### Обновление worklog

```http
PUT /rest/api/2/issue/PROJ-123/worklog/10023
```

#### Удаление worklog

```http
DELETE /rest/api/2/issue/PROJ-123/worklog/10023
```

### 2.2 Методы аутентификации

#### Personal Access Token (PAT) — рекомендуется

**Требования**: Jira Server 8.14+

```http
Authorization: Bearer <PAT_TOKEN>
```

**Преимущества:**
- Не требует сложной OAuth-настройки
- Токен привязан к пользователю
- Легко отозвать через UI Jira

**Получение токена**: Профиль пользователя → Personal Access Tokens → Create Token

#### OAuth 1.0a

Для Jira Server < 8.14 или корпоративных требований.

**Требуется:**
1. Создание Application Link в админке Jira
2. Генерация RSA ключей
3. Трёхэтапная OAuth-авторизация (request token → authorize → access token)

#### Basic Authentication

```http
Authorization: Basic base64(username:password)
```

**⚠️ Ограничения:**
- Только через HTTPS
- После нескольких неудачных попыток срабатывает CAPTCHA
- Проверяйте заголовок `X-Seraph-LoginReason: AUTHENTICATION_DENIED`

### 2.3 Rate Limiting

Jira Data Center использует **алгоритм token bucket**. При превышении лимитов возвращается `HTTP 429`.

**Стратегия обработки:**

```python
import time
import random

def request_with_backoff(request_func, max_retries=5):
    base_delay = 0.5  # 500ms
    max_delay = 30
    
    for attempt in range(max_retries):
        response = request_func()
        
        if response.status_code == 429:
            retry_after = response.headers.get('Retry-After')
            if retry_after:
                delay = int(retry_after)
            else:
                delay = min(base_delay * (2 ** attempt), max_delay)
            
            # Добавляем jitter ±10%
            jitter = delay * 0.1 * (2 * random.random() - 1)
            time.sleep(delay + jitter)
            continue
            
        return response
    
    raise Exception("Max retries exceeded")
```

---

## 3. Webhooks для автоматизации по статусам

### 3.1 Настройка webhook

**Путь в админке**: System → Webhooks → Create Webhook

**Или через API:**

```http
POST /rest/webhooks/1.0/webhook
Content-Type: application/json

{
  "name": "Task Center Time Tracking",
  "url": "https://localhost:3000/webhook/jira",
  "events": ["jira:issue_updated"],
  "filters": {
    "issue-related-events-section": "project = PROJ AND status changed"
  }
}
```

### 3.2 Payload при смене статуса

```json
{
  "webhookEvent": "jira:issue_updated",
  "timestamp": 1705485600000,
  "user": {
    "key": "ivan.petrov",
    "displayName": "Иван Петров"
  },
  "issue": {
    "key": "PROJ-123",
    "fields": {
      "summary": "Реализовать авторизацию",
      "status": {
        "name": "В работе",
        "id": "3"
      },
      "project": {
        "key": "PROJ"
      }
    }
  },
  "changelog": {
    "id": "12345",
    "items": [
      {
        "field": "status",
        "fieldtype": "jira",
        "from": "10000",
        "fromString": "К выполнению",
        "to": "10001",
        "toString": "В работе"
      }
    ]
  }
}
```

### 3.3 Логика обработки webhook

```python
def handle_jira_webhook(payload):
    if payload['webhookEvent'] != 'jira:issue_updated':
        return
    
    changelog = payload.get('changelog', {})
    status_changes = [
        item for item in changelog.get('items', [])
        if item['field'] == 'status'
    ]
    
    if not status_changes:
        return
    
    change = status_changes[0]
    issue_key = payload['issue']['key']
    from_status = change['fromString']
    to_status = change['toString']
    
    # Маппинг статусов на действия таймера
    STATUS_ACTIONS = {
        ('К выполнению', 'В работе'): 'START',
        ('В работе', 'На проверке'): 'STOP',
        ('В работе', 'Готово'): 'STOP',
        ('В работе', 'Заблокировано'): 'PAUSE',
        ('Заблокировано', 'В работе'): 'RESUME',
    }
    
    action = STATUS_ACTIONS.get((from_status, to_status))
    if action:
        timer_service.handle_action(issue_key, action)
```

### 3.4 Альтернатива: Polling API

Если webhooks недоступны (firewall, NAT), используйте polling:

```http
GET /rest/api/2/search?jql=project=PROJ AND status changed after -5m&fields=key,status,updated
```

**Интервал опроса**: 30-60 секунд (баланс между отзывчивостью и нагрузкой)

---

## 4. Детекция простоя (Idle Detection)

### 4.1 Platform-specific APIs

#### Windows

```cpp
#include <windows.h>

DWORD GetIdleTimeSeconds() {
    LASTINPUTINFO lii;
    lii.cbSize = sizeof(LASTINPUTINFO);
    GetLastInputInfo(&lii);
    return (GetTickCount() - lii.dwTime) / 1000;
}
```

#### macOS

```swift
import Quartz

func getIdleTimeSeconds() -> Double {
    let eventTypes: [CGEventType] = [.mouseMoved, .keyDown]
    var minIdle = Double.infinity
    
    for eventType in eventTypes {
        let idle = CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: eventType)
        minIdle = min(minIdle, idle)
    }
    
    return minIdle
}
```

#### Linux (X11)

```c
#include <X11/extensions/scrnsaver.h>

unsigned long getIdleTimeMillis() {
    Display *display = XOpenDisplay(NULL);
    XScreenSaverInfo *info = XScreenSaverAllocInfo();
    XScreenSaverQueryInfo(display, DefaultRootWindow(display), info);
    unsigned long idle = info->idle;
    XFree(info);
    XCloseDisplay(display);
    return idle;
}
```

### 4.2 Кросс-платформенные библиотеки

| Платформа | Библиотека |
|-----------|------------|
| Node.js/Electron | `desktop-idle` |
| Rust/Tauri | `user-idle` |
| Python | `pynput` + custom logic |

### 4.3 Рекомендуемые пороги простоя

| Тип работы | Порог | Обоснование |
|------------|-------|-------------|
| Разработка | 10-15 мин | Время на размышление, чтение документации |
| Аналитика | 15-20 мин | Работа с документами, созвоны |
| Поддержка | 5-7 мин | Быстрые тикеты, оперативная работа |

### 4.4 UI при возврате из простоя (паттерн Toggl)

```
┌─────────────────────────────────────────────────────────────┐
│  ⏸️  Вы отсутствовали 47 минут                              │
│                                                             │
│  Таймер: PROJ-123 "Реализовать авторизацию"                │
│  Время до простоя: 2h 15m                                   │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Удалить простой │  │ Продолжить      │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Как отдельную   │  │ Оставить всё    │                   │
│  │ запись (митинг) │  │ время           │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

**Варианты действий:**

1. **Удалить простой** — остановить таймер, вычесть время простоя
2. **Продолжить** — убрать время простоя, продолжить трекинг
3. **Как отдельную запись** — создать новую запись для простоя (полезно для митингов)
4. **Оставить всё время** — сохранить полную длительность включая простой

### 4.5 Детекция блокировки экрана

Дополнительный сигнал для автопаузы:

**Windows:**
```csharp
SystemEvents.SessionSwitch += (sender, e) => {
    if (e.Reason == SessionSwitchReason.SessionLock)
        timer.Pause();
    else if (e.Reason == SessionSwitchReason.SessionUnlock)
        ShowIdlePrompt();
};
```

**macOS:**
```swift
DistributedNotificationCenter.default().addObserver(
    forName: NSNotification.Name("com.apple.screenIsLocked"),
    object: nil, queue: .main
) { _ in timer.pause() }
```

---

## 5. Паттерн Heartbeat для непрерывного трекинга

### 5.1 Концепция

Вместо дискретных start/stop событий приложение отправляет периодические "heartbeat" (пульсы). Последовательные heartbeat'ы с одинаковыми метаданными объединяются в единую запись.

**Преимущества:**
- Устойчивость к сбоям (потеря одного heartbeat не теряет всю сессию)
- Естественная обработка коротких прерываний
- Точный учёт реальной активности

### 5.2 Алгоритм слияния heartbeat'ов

```python
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional

@dataclass
class TimeEntry:
    task_id: str
    timestamp: datetime
    duration: timedelta = timedelta(0)
    metadata: dict = None

class HeartbeatMerger:
    def __init__(self, pulsetime_seconds: int = 120):
        """
        pulsetime - максимальный интервал между heartbeat'ами
        для объединения в одну запись (по умолчанию 2 минуты)
        """
        self.pulsetime = timedelta(seconds=pulsetime_seconds)
        self.current_entry: Optional[TimeEntry] = None
    
    def process_heartbeat(self, task_id: str, timestamp: datetime, metadata: dict = None) -> Optional[TimeEntry]:
        """
        Обрабатывает новый heartbeat.
        Возвращает завершённую запись, если начата новая задача.
        """
        if self.current_entry is None:
            # Первый heartbeat
            self.current_entry = TimeEntry(task_id, timestamp, metadata=metadata)
            return None
        
        # Проверяем, можно ли объединить
        same_task = self.current_entry.task_id == task_id
        window_end = self.current_entry.timestamp + self.current_entry.duration + self.pulsetime
        within_window = timestamp <= window_end
        
        if same_task and within_window:
            # Расширяем текущую запись
            self.current_entry.duration = timestamp - self.current_entry.timestamp
            return None
        else:
            # Завершаем предыдущую, начинаем новую
            completed = self.current_entry
            self.current_entry = TimeEntry(task_id, timestamp, metadata=metadata)
            return completed
```

### 5.3 Оптимизация отправки heartbeat'ов (паттерн WakaTime)

```python
class HeartbeatDebouncer:
    def __init__(self, debounce_seconds: int = 120):
        self.debounce_interval = debounce_seconds
        self.last_heartbeat_time: datetime = None
        self.last_task_id: str = None
    
    def should_send(self, task_id: str, current_time: datetime) -> bool:
        """
        Отправляем heartbeat если:
        1. Сменилась задача, ИЛИ
        2. Прошло больше debounce_interval с последнего heartbeat
        """
        if self.last_task_id != task_id:
            return True
        
        if self.last_heartbeat_time is None:
            return True
        
        elapsed = (current_time - self.last_heartbeat_time).total_seconds()
        return elapsed >= self.debounce_interval
    
    def record_sent(self, task_id: str, time: datetime):
        self.last_task_id = task_id
        self.last_heartbeat_time = time
```

---

## 6. Архитектура конечного автомата таймера

### 6.1 Диаграмма состояний

```
                    ┌──────────────────┐
                    │                  │
         ┌──────────│      IDLE        │◄─────────────┐
         │          │                  │              │
         │          └────────┬─────────┘              │
         │                   │                        │
         │              START│                        │
         │                   ▼                        │
         │          ┌──────────────────┐              │
         │          │                  │         STOP │
    STOP │          │     RUNNING      │──────────────┤
         │          │                  │              │
         │          └───┬─────────┬────┘              │
         │              │         │                   │
         │        PAUSE │         │ IDLE_TIMEOUT      │
         │              ▼         ▼                   │
         │          ┌──────────────────┐              │
         │          │                  │              │
         └──────────│     PAUSED       │──────────────┘
                    │                  │
                    └────────┬─────────┘
                             │
                        RESUME
                             │
                             ▼
                    (возврат в RUNNING)
```

### 6.2 Таблица переходов

| Текущее состояние | Событие | Следующее состояние | Действие |
|-------------------|---------|---------------------|----------|
| IDLE | START | RUNNING | Записать время старта |
| RUNNING | PAUSE | PAUSED | Сохранить накопленное время, записать время паузы |
| RUNNING | STOP | IDLE | Рассчитать длительность, добавить в очередь синхронизации |
| RUNNING | IDLE_TIMEOUT | PAUSED | Автопауза, показать уведомление |
| PAUSED | RESUME | RUNNING | Возобновить с момента паузы |
| PAUSED | STOP | IDLE | Рассчитать длительность (без времени паузы), синхронизировать |

### 6.3 Реализация

```typescript
type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED';

interface TimerContext {
  state: TimerState;
  issueKey: string | null;
  startedAt: Date | null;
  pausedAt: Date | null;
  accumulatedSeconds: number;
}

class TimerStateMachine {
  private context: TimerContext = {
    state: 'IDLE',
    issueKey: null,
    startedAt: null,
    pausedAt: null,
    accumulatedSeconds: 0
  };

  start(issueKey: string): void {
    if (this.context.state !== 'IDLE') {
      throw new Error(`Cannot start from state: ${this.context.state}`);
    }
    
    this.context = {
      state: 'RUNNING',
      issueKey,
      startedAt: new Date(),
      pausedAt: null,
      accumulatedSeconds: 0
    };
    
    this.emit('timer:started', { issueKey });
  }

  pause(): void {
    if (this.context.state !== 'RUNNING') return;
    
    const now = new Date();
    const elapsed = (now.getTime() - this.context.startedAt!.getTime()) / 1000;
    
    this.context = {
      ...this.context,
      state: 'PAUSED',
      pausedAt: now,
      accumulatedSeconds: this.context.accumulatedSeconds + elapsed
    };
    
    this.emit('timer:paused', { 
      issueKey: this.context.issueKey,
      accumulated: this.context.accumulatedSeconds 
    });
  }

  resume(): void {
    if (this.context.state !== 'PAUSED') return;
    
    this.context = {
      ...this.context,
      state: 'RUNNING',
      startedAt: new Date(),
      pausedAt: null
    };
    
    this.emit('timer:resumed', { issueKey: this.context.issueKey });
  }

  stop(): TimeEntry | null {
    if (this.context.state === 'IDLE') return null;
    
    let totalSeconds = this.context.accumulatedSeconds;
    
    if (this.context.state === 'RUNNING') {
      const now = new Date();
      totalSeconds += (now.getTime() - this.context.startedAt!.getTime()) / 1000;
    }
    
    const entry: TimeEntry = {
      id: generateUUID(),
      issueKey: this.context.issueKey!,
      durationSeconds: Math.round(totalSeconds),
      startedAt: /* original start time */,
      syncStatus: 'pending'
    };
    
    this.context = {
      state: 'IDLE',
      issueKey: null,
      startedAt: null,
      pausedAt: null,
      accumulatedSeconds: 0
    };
    
    this.emit('timer:stopped', entry);
    return entry;
  }
}
```

### 6.4 Маппинг Jira-статусов на события таймера

```typescript
const STATUS_TRANSITIONS: Record<string, Record<string, TimerEvent>> = {
  'К выполнению': {
    'В работе': 'START',
    'В процессе': 'START'
  },
  'В работе': {
    'На проверке': 'STOP',
    'Готово': 'STOP',
    'Done': 'STOP',
    'Заблокировано': 'PAUSE',
    'На паузе': 'PAUSE'
  },
  'Заблокировано': {
    'В работе': 'RESUME'
  },
  'На проверке': {
    'В работе': 'START',  // Возврат на доработку
    'Готово': null        // Нет действия
  }
};

function getTimerEventForTransition(from: string, to: string): TimerEvent | null {
  return STATUS_TRANSITIONS[from]?.[to] ?? null;
}
```

---

## 7. Best Practices от Tempo, Toggl, WakaTime, Clockwork

### 7.1 Tempo Timesheets

**Глубокая интеграция с Jira** — нативное приложение из Marketplace с двусторонней синхронизацией.

**Ключевые паттерны:**
- AI-подсказки на основе активности (календарь, IDE, GitHub)
- One-click подтверждение предложенных записей
- Автоматическое распределение времени по задачам на основе коммитов

**Что взять для Task Center:**
- Предлагать записи на основе истории, а не только активного трекинга
- Интеграция с Git для автопривязки коммитов к задачам

### 7.2 Toggl Track

**Эталон обработки простоя и офлайн-синхронизации.**

**Ключевые паттерны:**

1. **Timeline** — записывает всю активность (окна, сайты) локально для реконструкции забытых периодов
2. **4 варианта обработки простоя** (см. раздел 4.4)
3. **Автостоп при блокировке ПК**
4. **Pomodoro-интеграция**

**Jira-синхронизация:**
- Односторонний импорт: Jira → Toggl
- Маппинг: Projects → Projects, Issues → Tasks, Labels → Tags

**Что взять:**
- Timeline для восстановления забытого времени
- Гибкие опции при возврате из простоя

### 7.3 WakaTime

**Мастер heartbeat-архитектуры.**

**Ключевые паттерны:**

1. **CLI-инструмент** для всей API-коммуникации
2. **Офлайн-хранилище** в BoltDB (`~/.wakatime/offline_heartbeats.bdb`)
3. **Batch-синхронизация** до 1000 событий за раз
4. **Автоопределение проекта** по Git-репозиторию или `.wakatime-project`

**Debounce-логика:**
```
Отправить heartbeat если:
- Сменился активный файл, ИЛИ
- Прошло 2+ минуты с последнего heartbeat
```

**Что взять:**
- Heartbeat с debounce для минимизации API-вызовов
- Автоопределение задачи по контексту (Git branch → Jira issue)

### 7.4 Clockwork

**Лидер в автоматизации по workflow.**

**Ключевые паттерны:**

1. **Автостарт/стоп по статусам** — zero manual intervention
2. **Автоматическое деление на дни** — если таймер работал через полночь, создаются две записи
3. **Учёт рабочего графика** — время вне рабочих часов может игнорироваться или помечаться

**Что взять:**
- Автоматическое деление записей по дням
- Конфигурируемый рабочий график

### 7.5 Сводная таблица паттернов

| Паттерн | Tempo | Toggl | WakaTime | Clockwork | Приоритет для Task Center |
|---------|-------|-------|----------|-----------|---------------------------|
| Status-based automation | ✓ | - | - | ✓✓ | **Высокий** |
| Idle detection | ✓ | ✓✓ | ✓ | ✓ | **Высокий** |
| Heartbeat tracking | - | - | ✓✓ | - | Средний |
| Timeline/activity log | - | ✓✓ | ✓ | - | Средний |
| Offline sync | ✓ | ✓✓ | ✓✓ | ✓ | **Высокий** |
| Day splitting | ✓ | ✓ | - | ✓✓ | Средний |
| Git integration | ✓ | - | ✓✓ | - | Низкий (v2) |

---

## 8. Схема локальной базы данных (SQLite)

```sql
-- Основная таблица записей времени
CREATE TABLE time_entries (
    id TEXT PRIMARY KEY,                    -- UUID для бесконфликтной синхронизации
    jira_issue_key TEXT NOT NULL,
    jira_issue_summary TEXT,                -- Кэш для офлайн-отображения
    jira_project_key TEXT,
    description TEXT,
    
    start_time DATETIME NOT NULL,
    end_time DATETIME,                      -- NULL когда таймер активен
    duration_seconds INTEGER,
    
    -- Метаданные синхронизации
    sync_status TEXT DEFAULT 'pending'      -- pending | syncing | synced | error
        CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
    jira_worklog_id TEXT,                   -- ID записи в Jira после синхронизации
    version INTEGER DEFAULT 1,               -- Оптимистичная блокировка
    synced_at DATETIME,
    last_sync_error TEXT,
    retry_count INTEGER DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для частых запросов
CREATE INDEX idx_time_entries_sync_status ON time_entries(sync_status);
CREATE INDEX idx_time_entries_issue_key ON time_entries(jira_issue_key);
CREATE INDEX idx_time_entries_start_time ON time_entries(start_time);

-- Очередь синхронизации
CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL                 -- create | update | delete
        CHECK (operation IN ('create', 'update', 'delete')),
    entity_type TEXT NOT NULL DEFAULT 'worklog',
    entity_id TEXT NOT NULL,                -- Ссылка на time_entries.id
    payload TEXT NOT NULL,                  -- JSON с данными для отправки
    
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sync_queue_status ON sync_queue(status, next_attempt_at);

-- Singleton для активного таймера
CREATE TABLE active_timer (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Гарантируем одну запись
    entry_id TEXT REFERENCES time_entries(id),
    started_at DATETIME NOT NULL,
    paused_at DATETIME,
    accumulated_seconds INTEGER DEFAULT 0,
    
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Кэш задач Jira для офлайн-работы
CREATE TABLE jira_issues_cache (
    issue_key TEXT PRIMARY KEY,
    summary TEXT,
    project_key TEXT,
    status_name TEXT,
    assignee TEXT,
    
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Timeline активности (опционально, для функции восстановления)
CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    window_title TEXT,
    app_name TEXT,
    duration_seconds INTEGER DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_log_timestamp ON activity_log(timestamp);

-- Триггер для обновления updated_at
CREATE TRIGGER update_time_entries_timestamp 
AFTER UPDATE ON time_entries
BEGIN
    UPDATE time_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### Почему UUID для id?

При офлайн-создании записей автоинкрементные ID могут конфликтовать между устройствами. UUID гарантирует уникальность без координации.

```typescript
import { v4 as uuidv4 } from 'uuid';

function createTimeEntry(issueKey: string): TimeEntry {
  return {
    id: uuidv4(),  // Уникален даже офлайн
    jiraIssueKey: issueKey,
    startTime: new Date(),
    syncStatus: 'pending'
  };
}
```

---

## 9. Очередь синхронизации и офлайн-работа

### 9.1 Принцип Optimistic UI

```
┌─────────────────────────────────────────────────────────────────┐
│                        Пользователь                              │
│                             │                                    │
│                      Останавливает таймер                        │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  1. Сохранить в локальную БД (time_entries)             │    │
│  │  2. Добавить в sync_queue                               │    │
│  │  3. Обновить UI → показать запись со статусом "syncing" │    │
│  └─────────────────────────────────────────────────────────┘    │
│                             │                                    │
│                    UI отвечает мгновенно                         │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Background Worker (отдельный поток/процесс)            │    │
│  │  - Берёт задачи из sync_queue                           │    │
│  │  - Отправляет в Jira API                                │    │
│  │  - Обновляет sync_status → 'synced'                     │    │
│  │  - При ошибке: retry с exponential backoff              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Обработчик очереди синхронизации

```typescript
class SyncWorker {
  private isProcessing = false;
  private readonly MAX_BATCH_SIZE = 10;

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const tasks = await db.query(`
        SELECT * FROM sync_queue 
        WHERE status = 'pending' 
          AND next_attempt_at <= datetime('now')
          AND attempt_count < max_attempts
        ORDER BY created_at ASC
        LIMIT ?
      `, [this.MAX_BATCH_SIZE]);

      for (const task of tasks) {
        await this.processTask(task);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processTask(task: SyncTask): Promise<void> {
    await db.run(`
      UPDATE sync_queue SET status = 'processing' WHERE id = ?
    `, [task.id]);

    try {
      const payload = JSON.parse(task.payload);
      
      switch (task.operation) {
        case 'create':
          const result = await jiraApi.createWorklog(
            payload.issueKey, 
            payload.worklog
          );
          
          // Сохраняем ID из Jira
          await db.run(`
            UPDATE time_entries 
            SET jira_worklog_id = ?, sync_status = 'synced', synced_at = datetime('now')
            WHERE id = ?
          `, [result.id, task.entity_id]);
          break;
          
        case 'update':
          await jiraApi.updateWorklog(
            payload.issueKey,
            payload.worklogId,
            payload.worklog
          );
          break;
          
        case 'delete':
          await jiraApi.deleteWorklog(
            payload.issueKey,
            payload.worklogId
          );
          break;
      }

      // Успех — удаляем из очереди
      await db.run(`
        UPDATE sync_queue SET status = 'completed' WHERE id = ?
      `, [task.id]);

    } catch (error) {
      await this.handleSyncError(task, error);
    }
  }

  private async handleSyncError(task: SyncTask, error: Error): Promise<void> {
    const isRetryable = this.isRetryableError(error);
    const newAttemptCount = task.attempt_count + 1;

    if (isRetryable && newAttemptCount < task.max_attempts) {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
      const delaySeconds = Math.min(Math.pow(2, newAttemptCount), 300);
      const jitter = delaySeconds * 0.1 * (Math.random() * 2 - 1);
      
      await db.run(`
        UPDATE sync_queue SET 
          status = 'pending',
          attempt_count = ?,
          next_attempt_at = datetime('now', '+' || ? || ' seconds'),
          last_error = ?
        WHERE id = ?
      `, [newAttemptCount, delaySeconds + jitter, error.message, task.id]);
      
      // Обновляем статус записи
      await db.run(`
        UPDATE time_entries SET sync_status = 'error', last_sync_error = ?
        WHERE id = ?
      `, [error.message, task.entity_id]);
      
    } else {
      // Permanent failure
      await db.run(`
        UPDATE sync_queue SET status = 'failed', last_error = ?
        WHERE id = ?
      `, [error.message, task.id]);
      
      await db.run(`
        UPDATE time_entries SET sync_status = 'error', last_sync_error = ?
        WHERE id = ?
      `, [`Permanent error: ${error.message}`, task.entity_id]);
      
      // Уведомить пользователя
      this.notifyUser('sync_failed', { task, error });
    }
  }

  private isRetryableError(error: any): boolean {
    // Retry: сетевые ошибки, 429, 5xx
    // Не retry: 400, 401, 403, 404
    if (error.code === 'NETWORK_ERROR') return true;
    if (error.status === 429) return true;
    if (error.status >= 500) return true;
    return false;
  }
}
```

### 9.3 Разрешение конфликтов

**Стратегия: Last-Write-Wins с приоритетом клиента**

```typescript
async function resolveConflict(
  localEntry: TimeEntry, 
  serverEntry: JiraWorklog
): Promise<'keep_local' | 'accept_server' | 'prompt_user'> {
  
  // Если локальная запись имеет несинхронизированные изменения — приоритет локальной
  if (localEntry.syncStatus === 'pending') {
    return 'keep_local';
  }
  
  // Если серверная версия новее и локальная синхронизирована — принять серверную
  const serverUpdated = new Date(serverEntry.updated);
  const localSynced = new Date(localEntry.syncedAt);
  
  if (serverUpdated > localSynced && localEntry.syncStatus === 'synced') {
    return 'accept_server';
  }
  
  // В сложных случаях — спросить пользователя
  return 'prompt_user';
}
```

---

## 10. Обработка переключения контекста

### 10.1 Quick Switch UI

Глобальный хоткей (например, `Ctrl+Shift+T`) открывает быстрый переключатель:

```
┌─────────────────────────────────────────────────┐
│  🔍 Переключить задачу                    [Esc] │
│  ─────────────────────────────────────────────  │
│  Недавние:                                      │
│  ▸ PROJ-123 Реализовать авторизацию    [2h 15m]│
│    PROJ-456 Исправить баг в отчётах    [45m]   │
│    PROJ-789 Code review PR #42         [30m]   │
│  ─────────────────────────────────────────────  │
│  Поиск: [________________]                      │
└─────────────────────────────────────────────────┘
```

**Логика переключения:**
1. Автоматически останавливает текущий таймер
2. Запускает таймер на выбранной задаче
3. Сохраняет timestamp переключения для возможной корректировки

### 10.2 Отслеживание активного окна

```typescript
interface WindowInfo {
  title: string;
  appName: string;
  url?: string;  // Для браузеров
}

class WindowTracker {
  private lastWindow: WindowInfo | null = null;
  private readonly POLL_INTERVAL = 5000; // 5 секунд

  start(): void {
    setInterval(() => this.checkActiveWindow(), this.POLL_INTERVAL);
  }

  private async checkActiveWindow(): Promise<void> {
    const current = await getActiveWindow(); // Platform-specific
    
    if (this.windowChanged(current)) {
      this.emit('window:changed', {
        from: this.lastWindow,
        to: current,
        timestamp: new Date()
      });
      this.lastWindow = current;
    }
  }

  private windowChanged(current: WindowInfo): boolean {
    if (!this.lastWindow) return true;
    return this.lastWindow.title !== current.title 
        || this.lastWindow.appName !== current.appName;
  }
}

// Правила для автоопределения задачи
const WINDOW_RULES: WindowRule[] = [
  {
    pattern: /PROJ-(\d+)/i,
    extract: (match) => `PROJ-${match[1]}`
  },
  {
    appName: 'IntelliJ IDEA',
    pattern: /\[(.+?)\]/,  // Название проекта в скобках
    mapToProject: true
  },
  {
    appName: 'Chrome',
    urlPattern: /jira\.company\.com\/browse\/([\w-]+)/,
    extract: (match) => match[1]
  }
];
```

### 10.3 Интеграция с календарём (опционально)

```typescript
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  attendees: string[];
}

class CalendarIntegration {
  async checkUpcomingMeetings(): Promise<CalendarEvent[]> {
    // Получить события на ближайший час
    const events = await calendarApi.getEvents({
      timeMin: new Date(),
      timeMax: addHours(new Date(), 1)
    });
    
    return events.filter(e => e.attendees.length > 1); // Только митинги
  }

  onMeetingStart(event: CalendarEvent): void {
    if (timerState.isRunning) {
      // Показать prompt: "Начался митинг. Приостановить таймер?"
      showMeetingPrompt({
        meeting: event,
        currentTask: timerState.currentIssue,
        options: [
          { label: 'Приостановить', action: 'pause' },
          { label: 'Переключить на митинг', action: 'switch', targetTask: 'MEET-xxx' },
          { label: 'Продолжить трекинг', action: 'continue' }
        ]
      });
    }
  }
}
```

---

## 11. Решения для edge-кейсов

### 11.1 Таймер работал через полночь

**Проблема**: Запись начата в 22:00, остановлена в 02:00 — нужно две записи.

**Решение (паттерн Clockwork):**

```typescript
function splitEntryByDay(entry: TimeEntry): TimeEntry[] {
  const start = new Date(entry.startTime);
  const end = new Date(entry.endTime);
  
  // Если в один день — возвращаем как есть
  if (isSameDay(start, end)) {
    return [entry];
  }
  
  const entries: TimeEntry[] = [];
  let currentStart = start;
  
  while (!isSameDay(currentStart, end)) {
    // Конец текущего дня
    const dayEnd = endOfDay(currentStart);
    
    entries.push({
      ...entry,
      id: uuidv4(),
      startTime: currentStart,
      endTime: dayEnd,
      durationSeconds: differenceInSeconds(dayEnd, currentStart)
    });
    
    // Начало следующего дня
    currentStart = startOfDay(addDays(currentStart, 1));
  }
  
  // Последний кусок
  entries.push({
    ...entry,
    id: uuidv4(),
    startTime: currentStart,
    endTime: end,
    durationSeconds: differenceInSeconds(end, currentStart)
  });
  
  return entries;
}
```

### 11.2 Работа в нескольких Jira-проектах

**Проверка прав перед стартом:**

```typescript
async function canTrackTime(projectKey: string): Promise<boolean> {
  const permissions = await jiraApi.get(
    `/rest/api/2/mypermissions?projectKey=${projectKey}&permissions=WORK_ON_ISSUES`
  );
  
  return permissions.permissions.WORK_ON_ISSUES.havePermission;
}
```

**Кэширование с TTL:**

```typescript
const permissionsCache = new Map<string, { allowed: boolean; expiresAt: Date }>();
const CACHE_TTL_MINUTES = 10;

async function checkPermissionCached(projectKey: string): Promise<boolean> {
  const cached = permissionsCache.get(projectKey);
  
  if (cached && cached.expiresAt > new Date()) {
    return cached.allowed;
  }
  
  const allowed = await canTrackTime(projectKey);
  permissionsCache.set(projectKey, {
    allowed,
    expiresAt: addMinutes(new Date(), CACHE_TTL_MINUTES)
  });
  
  return allowed;
}
```

### 11.3 Забыл запустить таймер

**Timeline для восстановления:**

```typescript
// Сохраняем активность каждые 10 секунд
class ActivityRecorder {
  private readonly MIN_DURATION = 10; // секунд

  async recordActivity(windowInfo: WindowInfo): Promise<void> {
    await db.run(`
      INSERT INTO activity_log (timestamp, window_title, app_name, duration_seconds)
      VALUES (datetime('now'), ?, ?, ?)
    `, [windowInfo.title, windowInfo.appName, this.MIN_DURATION]);
  }
}

// UI для создания записей из timeline
async function showTimelineRecovery(date: Date): Promise<void> {
  const activities = await db.query(`
    SELECT * FROM activity_log 
    WHERE date(timestamp) = date(?)
    ORDER BY timestamp ASC
  `, [date.toISOString()]);
  
  // Группируем по приложению/окну
  const grouped = groupConsecutiveActivities(activities);
  
  // Показываем UI для выбора периодов и привязки к задачам
  showRecoveryDialog(grouped);
}
```

### 11.4 Сетевые сбои при синхронизации

Уже решено архитектурой очереди (раздел 9). Дополнительно:

**Индикатор статуса подключения:**

```typescript
class ConnectionMonitor {
  private isOnline = navigator.onLine;

  constructor() {
    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
  }

  private setOnline(online: boolean): void {
    this.isOnline = online;
    
    if (online) {
      // Триггерим синхронизацию
      syncWorker.processQueue();
      showNotification('Подключение восстановлено. Синхронизация...');
    } else {
      showNotification('Работа в офлайн-режиме', { persistent: true });
    }
  }
}
```

---

## 12. Безопасность и хранение credentials

### 12.1 Использование OS Keychain

**Никогда не храните токены в конфигах или базе данных!**

#### Windows (Credential Manager)

```csharp
using Windows.Security.Credentials;

public class CredentialStore {
    private const string ResourceName = "TaskCenter_JiraToken";
    
    public void SaveToken(string username, string token) {
        var vault = new PasswordVault();
        vault.Add(new PasswordCredential(ResourceName, username, token));
    }
    
    public string GetToken(string username) {
        var vault = new PasswordVault();
        var credential = vault.Retrieve(ResourceName, username);
        credential.RetrievePassword();
        return credential.Password;
    }
}
```

#### macOS (Keychain)

```swift
import Security

func saveToken(_ token: String, for account: String) throws {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.taskcenter.jira",
        kSecAttrAccount as String: account,
        kSecValueData as String: token.data(using: .utf8)!
    ]
    
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.saveFailed }
}
```

#### Linux (Secret Service / libsecret)

```python
import secretstorage

def save_token(account: str, token: str):
    connection = secretstorage.dbus_init()
    collection = secretstorage.get_default_collection(connection)
    
    collection.create_item(
        f'TaskCenter Jira Token ({account})',
        {'application': 'taskcenter', 'account': account},
        token.encode(),
        replace=True
    )
```

#### Кросс-платформенно (Rust/Tauri)

```rust
use keyring::Entry;

fn save_token(account: &str, token: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new("taskcenter", account)?;
    entry.set_password(token)
}

fn get_token(account: &str) -> Result<String, keyring::Error> {
    let entry = Entry::new("taskcenter", account)?;
    entry.get_password()
}
```

### 12.2 Проактивное обновление OAuth-токенов

```typescript
class TokenManager {
  private readonly REFRESH_THRESHOLD_MINUTES = 5;

  async getValidToken(): Promise<string> {
    const tokenData = await this.loadToken();
    
    if (this.isExpiringSoon(tokenData)) {
      return await this.refreshToken(tokenData.refreshToken);
    }
    
    return tokenData.accessToken;
  }

  private isExpiringSoon(token: TokenData): boolean {
    const expiresAt = new Date(token.expiresAt);
    const threshold = addMinutes(new Date(), this.REFRESH_THRESHOLD_MINUTES);
    return expiresAt <= threshold;
  }
}
```

---

## 13. Рекомендуемый технологический стек

### 13.1 Сравнение Electron vs Tauri

| Критерий | Electron | Tauri 2.0 |
|----------|----------|-----------|
| Размер бандла | 100-200 MB | 3-10 MB |
| RAM в idle | 200-400 MB | 30-50 MB |
| Язык бэкенда | Node.js | Rust |
| Безопасность | Средняя | Высокая (memory safety) |
| System tray | ✓ | ✓ |
| Auto-updater | ✓ | ✓ |
| Кривая обучения | Низкая | Средняя |

**Рекомендация**: Tauri 2.0 для нового проекта — меньше ресурсов, лучше безопасность.

### 13.2 Архитектура приложения

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  React/Vue + TailwindCSS + State Management (Zustand/Pinia) │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (Tauri Commands)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core Layer (Rust)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Timer     │  │   Sync      │  │   Jira API Client   │  │
│  │   Service   │  │   Worker    │  │   (reqwest)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Idle      │  │   Window    │  │   Webhook Server    │  │
│  │   Detector  │  │   Tracker   │  │   (optional)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Storage Layer                            │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │  SQLite         │  │  OS Keychain                    │   │
│  │  (rusqlite)     │  │  (keyring crate)                │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 13.3 Ключевые зависимости

**Rust (Tauri backend):**
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "shell-open"] }
rusqlite = { version = "0.31", features = ["bundled"] }
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
keyring = "2"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
user-idle = "0.6"  # Cross-platform idle detection
```

**Frontend:**
```json
{
  "dependencies": {
    "react": "^18",
    "@tanstack/react-query": "^5",
    "zustand": "^4",
    "date-fns": "^3",
    "@tauri-apps/api": "^2"
  }
}
```

---

## 14. Чек-лист реализации

### Фаза 1: MVP (2-3 недели)

- [ ] Базовая структура Tauri-приложения
- [ ] SQLite схема и миграции
- [ ] Аутентификация через PAT
- [ ] Ручной старт/стоп таймера
- [ ] Создание worklog в Jira (без очереди)
- [ ] System tray с текущим таймером

### Фаза 2: Автоматизация (2-3 недели)

- [ ] Webhook-сервер для статус-переходов (или polling)
- [ ] Автостарт/стоп по статусам
- [ ] Idle detection с 4 опциями
- [ ] Автопауза при блокировке экрана
- [ ] Quick Switch UI с хоткеем

### Фаза 3: Надёжность (1-2 недели)

- [ ] Очередь синхронизации
- [ ] Offline-режим
- [ ] Retry с exponential backoff
- [ ] Индикатор статуса синхронизации
- [ ] Разрешение конфликтов

### Фаза 4: Улучшения (ongoing)

- [ ] Timeline для восстановления времени
- [ ] Автоопределение задачи по окну/Git
- [ ] Интеграция с календарём
- [ ] Деление записей по дням
- [ ] Отчёты и статистика

---

## Заключение

**Ключевые архитектурные решения для успеха Task Center:**

1. **Status-transition automation** — устраняет необходимость ручного старта/стопа
2. **Heartbeat-based tracking** — корректно обрабатывает реальность рабочего процесса
3. **Offline-first sync queue** — гарантирует надёжность без потери данных

**Приоритет реализации:**
1. Сначала webhook-автоматизация по статусам (максимальная ценность при минимальных изменениях привычек)
2. Затем idle detection (обработка неизбежных отвлечений)
3. В последнюю очередь — Timeline и smart suggestions

Очередь синхронизации должна быть заложена с самого начала — добавлять offline-поддержку позже значительно сложнее.

---

*Документ подготовлен для использования с Claude Code. Для внедрения рекомендуется начать с создания базовой структуры проекта и постепенно добавлять функциональность согласно чек-листу.*
