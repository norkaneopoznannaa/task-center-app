import React, { useState, useEffect } from 'react';
import './TitleBar.css';

interface TitleBarProps {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

export function TitleBar({ theme, onThemeToggle }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial state
    window.api.windowIsMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => window.api.windowMinimize();
  const handleMaximize = async () => {
    await window.api.windowMaximize();
    const maximized = await window.api.windowIsMaximized();
    setIsMaximized(maximized);
  };
  const handleClose = () => window.api.windowClose();

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <div className="title-bar-icon">📋</div>
        <span className="title-bar-text">Task Center</span>
      </div>
      <div className="title-bar-actions">
        <button
          className="theme-toggle"
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      <div className="title-bar-controls">
        <button className="title-bar-btn" onClick={handleMinimize} title="Свернуть">
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button className="title-bar-btn" onClick={handleMaximize} title={isMaximized ? 'Восстановить' : 'Развернуть'}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 0v2H0v8h8V8h2V0H2zm6 8H2V4h6v4z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button className="title-bar-btn title-bar-btn-close" onClick={handleClose} title="Закрыть">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
