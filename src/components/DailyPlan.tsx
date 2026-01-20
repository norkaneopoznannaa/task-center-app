import React, { useMemo } from 'react';
import { Task, PRIORITY_LABELS } from '../types';
import './DailyPlan.css';

interface DailyPlanProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStartTimer: (taskId: string) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
}

export const DailyPlan: React.FC<DailyPlanProps> = ({
  tasks,
  onTaskClick,
  onStartTimer,
  activeTimers,
}) => {
  // Алгоритм приоритизации для плана на день
  const dailyPlan = useMemo(() => {
    // Фильтруем только активные задачи (не выполненные/завершенные)
    const activeTasks = tasks.filter(
      (t) => t.status !== 'выполнена' && t.status !== 'завершена' && t.status !== 'заблокирована'
    );

    // Расчёт priority score для каждой задачи
    const scoredTasks = activeTasks.map((task) => {
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
          score += 100 * 0.25; // Просрочено - максимальный score
        } else if (daysUntil < 1) {
          score += 90 * 0.25; // Сегодня
        } else if (daysUntil < 3) {
          score += 70 * 0.25; // Ближайшие 3 дня
        } else if (daysUntil < 7) {
          score += 50 * 0.25; // На этой неделе
        } else {
          score += 20 * 0.25;
        }
      } else {
        score += 30 * 0.25; // Нет дедлайна - средний score
      }

      // 3. Статус "в работе" (20%)
      if (task.status === 'в работе') {
        score += 80 * 0.2; // Уже начатые задачи приоритетнее
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

    // Сортируем по score и берём топ-5
    return scoredTasks
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [tasks]);

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

  return (
    <div className="daily-plan">
      <div className="daily-plan-header">
        <div className="plan-title">
          <span className="plan-icon">📅</span>
          <h3>План на сегодня</h3>
        </div>
        <div className="plan-summary">
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
          <div className="plan-tasks">
            {dailyPlan.map(({ task, score }, index) => {
              const deadline = formatDeadline(task.deadline);
              const isActive = !!activeTimers[task.id];

              return (
                <div
                  key={task.id}
                  className={`plan-task ${isActive ? 'active' : ''}`}
                  onClick={() => onTaskClick(task)}
                >
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
            })}
          </div>
        )}
      </div>

    </div>
  );
};
