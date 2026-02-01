# План улучшения UI/UX "Детали задачи"

## Приоритизация (MoSCoW)

### Must Have (Критично)
1. **Sticky header с названием задачи** — улучшает навигацию при скролле
2. **Inline редактирование заметок** — основной use case
3. **Live timer counter** — обратная связь пользователю
4. **Кнопка "Открыть в Jira"** — частый запрос

### Should Have (Важно)
5. **Переупорядочивание секций** — логичный flow
6. **Унификация языка бейджей** — consistency
7. **Группировка сессий по дням** — удобство чтения
8. **Toast notifications** — обратная связь

### Could Have (Желательно)
9. **Inline edit для названия/описания** — power users
10. **SVG иконки вместо emoji** — визуальная стабильность
11. **Keyboard shortcuts** — accessibility
12. **История выгрузок в Jira** — audit trail

### Won't Have (Отложено)
- Drag-and-drop для секций
- Кастомные темы
- Экспорт в PDF

---

## Phase 1: Структурные изменения (1-2 дня)

### Файлы для изменения:
- `app/src/components/taskDetails/TaskHeader.tsx`
- `app/src/components/TaskDetails.tsx`
- `app/src/components/TaskDetails.css`

### Задачи:

#### 1.1 Sticky Header
```tsx
// TaskHeader.tsx - новая структура
<div className="task-details-header sticky">
  <div className="header-top">
    <h2 className="task-title-main">{task.title}</h2>
    <button className="btn-icon close-btn" onClick={onClose}>
      <CloseIcon />
    </button>
  </div>
  <div className="task-badges">
    {/* badges */}
  </div>
</div>
```

#### 1.2 CSS для sticky header
```css
.task-details-header.sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  padding: var(--spacing-md);
}
```

#### 1.3 Переупорядочивание секций в TaskDetails.tsx
```tsx
// Новый порядок:
<TaskHeader />
<div className="task-details-content">
  <TaskDescription />      {/* NEW: выделить из TaskContent */}
  <TaskJiraLinks />        {/* NEW: выделить из TaskContent */}
  <TaskTimeTracking />
  <TaskMetadata />
</div>
```

---

## Phase 2: Улучшение таймера (1 день)

### Файлы:
- `app/src/components/taskDetails/TaskTimeTracking.tsx`

### Задачи:

#### 2.1 Live counter компонент
```tsx
const LiveTimer: React.FC<{ startTime: Date }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  return (
    <span className="live-timer">
      {hours.toString().padStart(2, '0')}:
      {minutes.toString().padStart(2, '0')}:
      {seconds.toString().padStart(2, '0')}
    </span>
  );
};
```

#### 2.2 Раздельные кнопки Play/Stop
```tsx
<div className="timer-controls">
  <button
    className="btn-timer btn-play"
    onClick={() => onStartTimer(task.id)}
    disabled={isTimerActive}
  >
    <PlayIcon />
  </button>
  <button
    className="btn-timer btn-stop"
    onClick={() => onStopTimer(task.id)}
    disabled={!isTimerActive}
  >
    <StopIcon />
  </button>
</div>
```

---

## Phase 3: Inline редактирование (2 дня)

### Файлы:
- `app/src/components/taskDetails/TaskContent.tsx` (или новый `EditableNotes.tsx`)
- `app/src/hooks/useAutoSave.ts` (новый)

### Задачи:

#### 3.1 Компонент EditableNotes
```tsx
interface EditableNotesProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
}

export const EditableNotes: React.FC<EditableNotesProps> = ({
  value,
  onSave,
  placeholder = 'Добавить заметки...'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    onSave(draft);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div
        className="notes-display"
        onClick={() => setIsEditing(true)}
        title="Нажмите для редактирования"
      >
        {value || <span className="placeholder">{placeholder}</span>}
        <EditIcon className="edit-hint" />
      </div>
    );
  }

  return (
    <div className="notes-editor">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        rows={5}
      />
      <div className="editor-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSave}>
          Сохранить
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => { setDraft(value); setIsEditing(false); }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
```

#### 3.2 Hook useAutoSave
```tsx
export function useAutoSave<T>(
  value: T,
  onSave: (value: T) => void,
  delay: number = 1000
) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      onSave(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, onSave, delay]);
}
```

---

## Phase 4: Улучшение Jira интеграции (1 день)

### Файлы:
- `app/src/components/taskDetails/TaskContent.tsx`
- `app/src/components/taskDetails/TaskTimeTracking.tsx`

### Задачи:

#### 4.1 Кнопка "Открыть в Jira"
```tsx
<div className="jira-links">
  {task.jira_references.map((ref, i) => (
    <div key={i} className="jira-link-item">
      <a href={ref.url} target="_blank" rel="noopener noreferrer" className="jira-link">
        {ref.ticket_id}
      </a>
      <button
        className="btn-icon btn-open-jira"
        onClick={() => window.open(ref.url, '_blank')}
        title="Открыть в Jira"
      >
        <ExternalLinkIcon />
      </button>
    </div>
  ))}
</div>
```

#### 4.2 Улучшенный preview экспорта
```tsx
<div className="jira-export-preview">
  <div className="export-summary">
    <span className="export-time">{formatDuration(roundTo30Minutes(totalMinutes))}</span>
    <span className="export-arrow">→</span>
    <span className="export-target">{task.jira_references[0].ticket_id}</span>
  </div>
  <div className="export-note">
    <InfoIcon />
    <span>Время округляется до 30 минут</span>
  </div>
</div>
```

---

## Phase 5: Visual polish (0.5 дня)

### Файлы:
- `app/src/components/TaskDetails.css`
- `app/src/components/icons/` (новая папка)

### Задачи:

#### 5.1 SVG иконки
Заменить emoji на SVG:
- 📋 → ClipboardIcon
- 🔗 → LinkIcon
- 👤 → UserIcon
- ▶ → PlayIcon
- ⏹ → StopIcon
- ✕ → CloseIcon
- 📤 → UploadIcon

#### 5.2 Улучшение typography
```css
/* Увеличенные размеры шрифтов */
.task-description {
  font-size: 14px;
  line-height: 1.6;
}

.detail-section label {
  font-size: 12px;
  text-transform: none; /* убрать uppercase */
  font-weight: 500;
}

/* Улучшенная контрастность */
.meta-label {
  color: var(--text-secondary); /* вместо --text-muted */
}
```

---

## Phase 6: Accessibility (0.5 дня)

### Задачи:

#### 6.1 Keyboard navigation
```tsx
// TaskDetails.tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [onClose]);
```

#### 6.2 ARIA labels
```tsx
<button
  className="btn-timer"
  aria-label={isTimerActive ? "Остановить таймер" : "Запустить таймер"}
  aria-pressed={isTimerActive}
>
```

#### 6.3 Focus management
```tsx
// При открытии панели — фокус на заголовок
const headerRef = useRef<HTMLHeadingElement>(null);
useEffect(() => {
  headerRef.current?.focus();
}, [task?.id]);
```

---

## Итоговые сроки

| Phase | Название | Дней |
|-------|----------|------|
| 1 | Структурные изменения | 1-2 |
| 2 | Улучшение таймера | 1 |
| 3 | Inline редактирование | 2 |
| 4 | Jira интеграция | 1 |
| 5 | Visual polish | 0.5 |
| 6 | Accessibility | 0.5 |
| **Итого** | | **6-7 дней** |

---

## Метрики успеха

1. **Время на изменение статуса**: уменьшить с 3 кликов до 1
2. **Время на добавление заметки**: inline вместо открытия модального окна
3. **Ошибки при экспорте в Jira**: уменьшить за счёт preview
4. **User satisfaction**: провести A/B тестирование со старым UI

---

## Зависимости

- Требуется библиотека иконок (рекомендую `lucide-react` или `@heroicons/react`)
- Toast notifications: можно использовать `react-hot-toast` или реализовать свой

## Риски

1. **Inline editing может конфликтовать с auto-save** → решение: debounce + optimistic UI
2. **Sticky header может перекрывать контент** → решение: правильный padding-top
3. **SVG иконки увеличат bundle size** → решение: tree-shaking + lazy load
