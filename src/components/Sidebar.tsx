import React from 'react';
import { TaskFilters, Priority, Status, Category, CATEGORY_COLORS } from '../types';
import './Sidebar.css';

type Page = 'tasks' | 'worklogs';

interface SidebarProps {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  stats: {
    total: number;
    new: number;
    inProgress: number;
    done: number;
    blocked: number;
  };
  activePage: Page;
  onPageChange: (page: Page) => void;
}

const STATUS_OPTIONS: { value: Status | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'Все задачи', icon: '📋' },
  { value: 'новая', label: 'Новые', icon: '🆕' },
  { value: 'в работе', label: 'В работе', icon: '⏳' },
  { value: 'завершена', label: 'Завершенные', icon: '✅' },
  { value: 'заблокирована', label: 'Заблокированные', icon: '🚫' },
];

const PRIORITY_OPTIONS: { value: Priority | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'Все приоритеты', color: 'var(--text-secondary)' },
  { value: 'CRITICAL', label: 'Критические', color: 'var(--priority-critical)' },
  { value: 'HIGH', label: 'Высокие', color: 'var(--priority-high)' },
  { value: 'MEDIUM', label: 'Средние', color: 'var(--priority-medium)' },
  { value: 'LOW', label: 'Низкие', color: 'var(--priority-low)' },
  { value: 'BACKLOG', label: 'Бэклог', color: 'var(--priority-backlog)' },
];

const CATEGORY_OPTIONS: { value: Category | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'Все', color: 'var(--text-secondary)' },
  { value: 'РЭМД', label: 'РЭМД', color: CATEGORY_COLORS['РЭМД'] },
  { value: 'КУ ФЭР', label: 'КУ ФЭР', color: CATEGORY_COLORS['КУ ФЭР'] },
  { value: 'Авто', label: 'Авто', color: CATEGORY_COLORS['Авто'] },
  { value: 'Общие', label: 'Общие', color: CATEGORY_COLORS['Общие'] },
];

export function Sidebar({ filters, onFiltersChange, stats, activePage, onPageChange }: SidebarProps) {
  const handleStatusChange = (status: Status | 'all') => {
    onFiltersChange({ ...filters, status });
  };

  const handlePriorityChange = (priority: Priority | 'all') => {
    onFiltersChange({ ...filters, priority });
  };

  const handleCategoryChange = (category: Category | 'all') => {
    onFiltersChange({ ...filters, category });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, search: e.target.value });
  };

  const getStatusCount = (status: Status | 'all') => {
    switch (status) {
      case 'all': return stats.total;
      case 'новая': return stats.new;
      case 'в работе': return stats.inProgress;
      case 'завершена': return stats.done;
      case 'заблокирована': return stats.blocked;
      default: return 0;
    }
  };

  return (
    <aside className="sidebar">
      {/* Navigation */}
      <div className="sidebar-section sidebar-nav">
        <button
          className={`sidebar-nav-item ${activePage === 'tasks' ? 'active' : ''}`}
          onClick={() => onPageChange('tasks')}
        >
          <span className="sidebar-nav-icon">T</span>
          <span>Задачи</span>
        </button>
        <button
          className={`sidebar-nav-item ${activePage === 'worklogs' ? 'active' : ''}`}
          onClick={() => onPageChange('worklogs')}
        >
          <span className="sidebar-nav-icon">W</span>
          <span>Worklogs</span>
        </button>
      </div>

      {activePage === 'tasks' && (
        <>
          {/* Search */}
          <div className="sidebar-section">
            <input
              type="text"
              className="input sidebar-search"
              placeholder="Поиск задач..."
              value={filters.search}
              onChange={handleSearchChange}
            />
          </div>

          {/* Category Filter */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Проект</h3>
        <div className="sidebar-filter-list category-list">
          {CATEGORY_OPTIONS.map(option => (
            <button
              key={option.value}
              className={`sidebar-filter-item category-item ${filters.category === option.value ? 'active' : ''}`}
              onClick={() => handleCategoryChange(option.value)}
            >
              <span
                className="sidebar-filter-dot"
                style={{ backgroundColor: option.color }}
              />
              <span className="sidebar-filter-label">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Status Filter */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Статус</h3>
        <div className="sidebar-filter-list">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.value}
              className={`sidebar-filter-item ${filters.status === option.value ? 'active' : ''}`}
              onClick={() => handleStatusChange(option.value)}
            >
              <span className="sidebar-filter-icon">{option.icon}</span>
              <span className="sidebar-filter-label">{option.label}</span>
              <span className="sidebar-filter-count">{getStatusCount(option.value)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Priority Filter */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Приоритет</h3>
        <div className="sidebar-filter-list">
          {PRIORITY_OPTIONS.map(option => (
            <button
              key={option.value}
              className={`sidebar-filter-item ${filters.priority === option.value ? 'active' : ''}`}
              onClick={() => handlePriorityChange(option.value)}
            >
              <span
                className="sidebar-filter-dot"
                style={{ backgroundColor: option.color }}
              />
              <span className="sidebar-filter-label">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="sidebar-stats">
        <div className="sidebar-stat">
          <span className="sidebar-stat-value">{stats.total}</span>
          <span className="sidebar-stat-label">Всего</span>
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-value" style={{ color: 'var(--status-progress)' }}>
            {stats.inProgress}
          </span>
          <span className="sidebar-stat-label">В работе</span>
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-value" style={{ color: 'var(--status-done)' }}>
            {stats.done}
          </span>
          <span className="sidebar-stat-label">Готово</span>
        </div>
      </div>
        </>
      )}
    </aside>
  );
}
