import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { LocalWorklog } from '../types/worklog';
import './StatusReportPage.css';

interface StatusReportPageProps {
  tasks: { id: string; title: string; jira_references: { ticket_id: string }[] }[];
}

interface ReportData {
  totalMinutes: number;
  byProject: Record<string, {
    minutes: number;
    tasks: Record<string, {
      title: string;
      jiraKey: string | null;
      minutes: number;
      descriptions: string[];
    }>;
  }>;
}

export function StatusReportPage({ tasks }: StatusReportPageProps) {
  const [worklogs, setWorklogs] = useState<LocalWorklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    return monday.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const friday = new Date(today);
    friday.setDate(today.getDate() - today.getDay() + 5);
    return friday.toISOString().split('T')[0];
  });
  const [reportText, setReportText] = useState('');

  // Load worklogs for selected range
  const loadWorklogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.api.getWorklogsByRange(startDate, endDate);
      if (result.success && result.worklogs) {
        setWorklogs(result.worklogs);
      }
    } catch (error) {
      console.error('Error loading worklogs:', error);
      toast.error('Ошибка загрузки worklogs');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadWorklogs();
  }, [loadWorklogs]);

  // Determine project from Jira key
  const getProject = (jiraKey: string | null, taskTitle: string): string => {
    if (jiraKey) {
      if (jiraKey.startsWith('EGISZREMD') || jiraKey.startsWith('REMD')) return 'РЭМД';
      if (jiraKey.startsWith('FER') || jiraKey.startsWith('KUFER')) return 'КУ ФЭР';
    }
    const title = taskTitle.toLowerCase();
    if (title.includes('рэмд') || title.includes('remd') || title.includes('сэмд') || title.includes('егисз')) return 'РЭМД';
    if (title.includes('фэр') || title.includes('fer') || title.includes('ку фэр')) return 'КУ ФЭР';
    return 'Общие';
  };

  // Generate report data
  const generateReportData = useCallback((): ReportData => {
    const data: ReportData = {
      totalMinutes: 0,
      byProject: {}
    };

    worklogs.forEach(worklog => {
      const project = getProject(worklog.jiraKey, worklog.taskTitle);
      data.totalMinutes += worklog.durationMinutes;

      if (!data.byProject[project]) {
        data.byProject[project] = { minutes: 0, tasks: {} };
      }
      data.byProject[project].minutes += worklog.durationMinutes;

      const taskKey = worklog.jiraKey || worklog.taskId;
      if (!data.byProject[project].tasks[taskKey]) {
        data.byProject[project].tasks[taskKey] = {
          title: worklog.taskTitle,
          jiraKey: worklog.jiraKey,
          minutes: 0,
          descriptions: []
        };
      }
      data.byProject[project].tasks[taskKey].minutes += worklog.durationMinutes;
      if (worklog.description && !data.byProject[project].tasks[taskKey].descriptions.includes(worklog.description)) {
        data.byProject[project].tasks[taskKey].descriptions.push(worklog.description);
      }
    });

    return data;
  }, [worklogs]);

  // Format duration
  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}ч ${mins}м`;
    if (hours > 0) return `${hours}ч`;
    return `${mins}м`;
  };

  // Format hours for report
  const formatHours = (minutes: number): string => {
    const hours = (minutes / 60).toFixed(1);
    return `${hours}ч`;
  };

  // Generate text report
  const generateReport = useCallback(() => {
    const data = generateReportData();
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    };

    let report = `Статус за неделю ${formatDate(startDate)} - ${formatDate(endDate)}\n`;
    report += `Всего: ${formatHours(data.totalMinutes)}\n\n`;

    Object.entries(data.byProject).sort().forEach(([project, projectData]) => {
      report += `${project} (${formatHours(projectData.minutes)}):\n`;

      Object.values(projectData.tasks).forEach(task => {
        const jiraRef = task.jiraKey ? `[${task.jiraKey}] ` : '';
        report += `  - ${jiraRef}${task.title} (${formatHours(task.minutes)})\n`;

        task.descriptions.forEach(desc => {
          if (desc.trim()) {
            report += `    • ${desc}\n`;
          }
        });
      });
      report += '\n';
    });

    setReportText(report.trim());
  }, [generateReportData, startDate, endDate]);

  useEffect(() => {
    if (!loading && worklogs.length > 0) {
      generateReport();
    } else if (!loading) {
      setReportText('Нет записей за выбранный период');
    }
  }, [worklogs, loading, generateReport]);

  // Copy to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      toast.success('Скопировано в буфер обмена');
    } catch (error) {
      toast.error('Ошибка копирования');
    }
  };

  // Set current week
  const setCurrentWeek = () => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    const friday = new Date(today);
    friday.setDate(today.getDate() - today.getDay() + 5);
    setStartDate(monday.toISOString().split('T')[0]);
    setEndDate(friday.toISOString().split('T')[0]);
  };

  // Set last week
  const setLastWeek = () => {
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - today.getDay() - 6);
    const lastFriday = new Date(today);
    lastFriday.setDate(today.getDate() - today.getDay() - 2);
    setStartDate(lastMonday.toISOString().split('T')[0]);
    setEndDate(lastFriday.toISOString().split('T')[0]);
  };

  const reportData = generateReportData();

  return (
    <div className="status-report-page">
      {/* Header */}
      <div className="report-header">
        <h2 className="report-title">Еженедельный статус</h2>
        <div className="report-date-range">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="date-input"
          />
          <span className="date-separator">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="date-input"
          />
          <button className="report-btn-small" onClick={setCurrentWeek}>
            Эта неделя
          </button>
          <button className="report-btn-small" onClick={setLastWeek}>
            Прошлая
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="report-summary">
        <div className="summary-item">
          <span className="summary-value">{formatDuration(reportData.totalMinutes)}</span>
          <span className="summary-label">Всего</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{worklogs.length}</span>
          <span className="summary-label">Записей</span>
        </div>
        {Object.entries(reportData.byProject).map(([project, data]) => (
          <div key={project} className="summary-item">
            <span className="summary-value">{formatDuration(data.minutes)}</span>
            <span className="summary-label">{project}</span>
          </div>
        ))}
      </div>

      {/* Report Preview & Actions */}
      <div className="report-content">
        <div className="report-actions">
          <button className="btn btn-primary" onClick={copyToClipboard}>
            Копировать отчёт
          </button>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : (
          <div className="report-preview">
            <pre className="report-text">{reportText}</pre>
          </div>
        )}
      </div>

      {/* Detailed breakdown */}
      {!loading && worklogs.length > 0 && (
        <div className="report-details">
          <h3>Детализация по проектам</h3>
          {Object.entries(reportData.byProject).sort().map(([project, projectData]) => (
            <div key={project} className="project-section">
              <div className="project-header">
                <span className="project-name">{project}</span>
                <span className="project-total">{formatDuration(projectData.minutes)}</span>
              </div>
              <div className="project-tasks">
                {Object.values(projectData.tasks).map((task, idx) => (
                  <div key={idx} className="report-task-row">
                    <div className="report-task-info">
                      {task.jiraKey && (
                        <span className="report-task-jira">{task.jiraKey}</span>
                      )}
                      <span className="report-task-title">{task.title}</span>
                    </div>
                    <span className="report-task-time">{formatDuration(task.minutes)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
