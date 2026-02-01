import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, PRIORITY_LABELS } from '../types';
import './DailyPlan.css';

interface DailyPlanProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStartTimer: (taskId: string) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
}

interface SortableTaskProps {
  task: Task;
  score: number;
  index: number;
  isActive: boolean;
  onTaskClick: (task: Task) => void;
  onStartTimer: (taskId: string) => void;
  getPriorityClass: (priority: string) => string;
  getCategoryClass: (category: string) => string;
  getPriorityIcon: (priority: string) => string;
  getScoreLabel: (score: number) => string;
  formatDeadline: (deadline: string | undefined) => { text: string; class: string } | null;
}

// Sortable Task Item Component
const SortableTaskItem: React.FC<SortableTaskProps> = ({
  task,
  score,
  index,
  isActive,
  onTaskClick,
  onStartTimer,
  getPriorityClass,
  getCategoryClass,
  getPriorityIcon,
  getScoreLabel,
  formatDeadline,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
  };

  const deadline = formatDeadline(task.deadline);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`plan-task ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={() => onTaskClick(task)}
    >
      <div
        className="drag-handle"
        title="Перетащите для изменения порядка"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </div>

      <div className="task-rank">
        <span className="rank-number">{index + 1}</span>
        <span className="rank-icon">{getPriorityIcon(task.priority)}</span>
      </div>

      <div className="task-info">
        <div className="task-header">
          <span className="task-name">{task.title}</span>
          {task.jira_references && task.jira_references.length > 0 && (
            <span className="jira-badge">
              {task.jira_references[0].ticket_id}
            </span>
          )}
        </div>
        <div className="task-meta">
          {task.category && (
            <span className={`category-tag ${getCategoryClass(task.category)}`}>
              {task.category}
            </span>
          )}
          <span
            className={`priority-tag ${getPriorityClass(task.priority)}`}
            title={`Priority Score: ${Math.round(score)} - ${getScoreLabel(score)}`}
          >
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
          {deadline && (
            <span className={`deadline-tag ${deadline.class}`}>
              {deadline.text}
            </span>
          )}
          {task.metadata?.estimated_hours && (
            <span className="time-tag">
              ~{task.metadata.estimated_hours}ч
            </span>
          )}
        </div>
      </div>

      <button
        className={`start-btn ${isActive ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onStartTimer(task.id);
        }}
        title={isActive ? 'Таймер активен' : 'Начать работу'}
      >
        {isActive ? '⏸' : '▶'}
      </button>
    </div>
  );
};

const STORAGE_KEY = 'task-center-daily-plan-order';

export const DailyPlan: React.FC<DailyPlanProps> = ({
  tasks,
  onTaskClick,
  onStartTimer,
  activeTimers,
}) => {
  // Ручной порядок задач (массив ID)
  const [manualOrder, setManualOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Минимальное расстояние перед началом drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Алгоритм приоритизации для плана на день
  const scoredTasks = useMemo(() => {
    // Фильтруем только активные задачи (не выполненные/завершенные)
    const activeTasks = tasks.filter(
      (t) => t.status !== 'выполнена' && t.status !== 'завершена' && t.status !== 'заблокирована'
    );

    // Расчёт priority score для каждой задачи
    return activeTasks.map((task) => {
      let score = 0;

      // 1. Базовый приоритет (30%)
      const priorityScores: Record<string, number> = {
        CRITICAL: 100,
        HIGH: 75,
        MEDIUM: 50,
        LOW: 25,
        BACKLOG: 10,
      };
      score += (priorityScores[task.priority] || 50) * 0.3;

      // 2. Дедлайн (25%)
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const now = new Date();
        const daysUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

        if (daysUntil < 0) {
          score += 100 * 0.25;
        } else if (daysUntil < 1) {
          score += 90 * 0.25;
        } else if (daysUntil < 3) {
          score += 70 * 0.25;
        } else if (daysUntil < 7) {
          score += 50 * 0.25;
        } else {
          score += 20 * 0.25;
        }
      } else {
        score += 30 * 0.25;
      }

      // 3. Статус "в работе" (20%)
      if (task.status === 'в работе') {
        score += 80 * 0.2;
      } else if (task.status === 'новая') {
        score += 50 * 0.2;
      }

      // 4. Наличие Jira референса (10%)
      if (task.jira_references && task.jira_references.length > 0) {
        score += 60 * 0.1;
      }

      // 5. AI уверенность (10%)
      if (task.ai_classification_confidence) {
        score += task.ai_classification_confidence * 100 * 0.1;
      } else {
        score += 50 * 0.1;
      }

      // 6. Упоминания людей (5%)
      if (task.mentions && task.mentions.length > 0) {
        score += 70 * 0.05;
      }

      return { task, score };
    });
  }, [tasks]);

  // Финальный план с учётом ручного порядка
  const dailyPlan = useMemo(() => {
    const sortedByScore = [...scoredTasks]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (manualOrder.length > 0) {
      const taskIds = sortedByScore.map(t => t.task.id);
      const validManualOrder = manualOrder.filter(id => taskIds.includes(id));

      if (validManualOrder.length > 0) {
        const ordered = validManualOrder
          .map(id => sortedByScore.find(t => t.task.id === id))
          .filter(Boolean) as typeof sortedByScore;

        const newTasks = sortedByScore.filter(t => !validManualOrder.includes(t.task.id));
        return [...ordered, ...newTasks].slice(0, 5);
      }
    }

    return sortedByScore;
  }, [scoredTasks, manualOrder]);

  // Сохраняем порядок в localStorage
  useEffect(() => {
    if (manualOrder.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(manualOrder));
    }
  }, [manualOrder]);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = dailyPlan.findIndex(t => t.task.id === active.id);
      const newIndex = dailyPlan.findIndex(t => t.task.id === over.id);

      const newOrder = arrayMove(
        dailyPlan.map(t => t.task.id),
        oldIndex,
        newIndex
      );

      setManualOrder(newOrder);
    }
  }, [dailyPlan]);

  // Сброс ручного порядка
  const handleResetOrder = useCallback(() => {
    setManualOrder([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Расчёт общего времени
  const totalEstimated = useMemo(() => {
    return dailyPlan.reduce((sum, { task }) => {
      return sum + (task.metadata?.estimated_hours || 0);
    }, 0);
  }, [dailyPlan]);

  const getPriorityClass = (priority: string) => {
    const map: Record<string, string> = {
      CRITICAL: 'critical',
      HIGH: 'high',
      MEDIUM: 'medium',
      LOW: 'low',
      BACKLOG: 'backlog',
    };
    return map[priority] || 'medium';
  };

  const getCategoryClass = (category: string) => {
    const map: Record<string, string> = {
      'РЭМД': 'remd',
      'КУ ФЭР': 'kufer',
      'общие': 'common',
      'авто': 'auto',
    };
    return map[category] || 'default';
  };

  const getPriorityIcon = (priority: string) => {
    const icons: Record<string, string> = {
      CRITICAL: '🔥',
      HIGH: '⚠️',
      MEDIUM: '📋',
      LOW: '💤',
      BACKLOG: '📦',
    };
    return icons[priority] || '📋';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Критично';
    if (score >= 60) return 'Важно';
    if (score >= 40) return 'Средне';
    return 'Низко';
  };

  const formatDeadline = (deadline: string | undefined) => {
    if (!deadline) return null;
    const date = new Date(deadline);
    const now = new Date();
    const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      return { text: `Просрочено на ${Math.abs(daysUntil)} дн.`, class: 'overdue' };
    } else if (daysUntil === 0) {
      return { text: 'Сегодня', class: 'today' };
    } else if (daysUntil === 1) {
      return { text: 'Завтра', class: 'tomorrow' };
    } else if (daysUntil <= 7) {
      return { text: `Через ${daysUntil} дн.`, class: 'week' };
    }
    return {
      text: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      class: 'later'
    };
  };

  const isManuallyOrdered = manualOrder.length > 0;

  return (
    <div className="daily-plan">
      <div className="daily-plan-header">
        <div className="plan-title">
          <span className="plan-icon">📅</span>
          <h3>План на сегодня</h3>
        </div>
        <div className="plan-summary">
          {isManuallyOrdered && (
            <button
              className="reset-order-btn"
              onClick={handleResetOrder}
              title="Сбросить ручной порядок"
            >
              ↺
            </button>
          )}
          <span className="task-count">{dailyPlan.length} задач</span>
          {totalEstimated > 0 && (
            <span className="time-estimate">~{totalEstimated}ч</span>
          )}
        </div>
      </div>

      <div className="daily-plan-content">
        {dailyPlan.length === 0 ? (
          <div className="no-tasks">
            <span className="no-tasks-icon">🎉</span>
            <p>Нет активных задач на сегодня</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={dailyPlan.map(t => t.task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="plan-tasks">
                {dailyPlan.map(({ task, score }, index) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    score={score}
                    index={index}
                    isActive={!!activeTimers[task.id]}
                    onTaskClick={onTaskClick}
                    onStartTimer={onStartTimer}
                    getPriorityClass={getPriorityClass}
                    getCategoryClass={getCategoryClass}
                    getPriorityIcon={getPriorityIcon}
                    getScoreLabel={getScoreLabel}
                    formatDeadline={formatDeadline}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};
