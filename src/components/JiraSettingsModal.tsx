import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import './Modal.css';

interface JiraSettingsModalProps {
  onClose: () => void;
}

interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  isConfigured: boolean;
}

export function JiraSettingsModal({ onClose }: JiraSettingsModalProps) {
  const [config, setConfig] = useState<JiraConfig>({
    baseUrl: 'https://jira.i-novus.ru',
    email: '',
    apiToken: '',
    isConfigured: false,
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result = await window.api.getJiraConfig();
        if (result.success && result.config) {
          setConfig(result.config);
          if (result.config.isConfigured) {
            setConnectionStatus({ status: 'success', message: 'Подключение настроено' });
          }
        }
      } catch (error) {
        console.error('Error loading Jira config:', error);
      }
    };
    loadConfig();
  }, []);

  const handleTestConnection = async () => {
    if (!config.email || !config.apiToken) {
      toast.error('Заполните email и API токен');
      return;
    }

    setTesting(true);
    setConnectionStatus({ status: 'loading', message: 'Проверка подключения...' });

    try {
      // First save the config
      await window.api.saveJiraConfig({
        baseUrl: config.baseUrl,
        email: config.email,
        apiToken: config.apiToken,
      });

      // Then test connection
      const result = await window.api.testJiraConnection();
      if (result.success) {
        setConnectionStatus({
          status: 'success',
          message: `Подключено как: ${result.user}`,
        });
        toast.success('Подключение успешно!');
      } else {
        setConnectionStatus({
          status: 'error',
          message: result.error || 'Ошибка подключения',
        });
        toast.error(result.error || 'Ошибка подключения');
      }
    } catch (error) {
      setConnectionStatus({
        status: 'error',
        message: String(error),
      });
      toast.error('Ошибка подключения');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await window.api.saveJiraConfig({
        baseUrl: config.baseUrl,
        email: config.email,
        apiToken: config.apiToken,
      });

      if (result.success) {
        toast.success('Настройки сохранены');
        onClose();
      } else {
        toast.error(result.error || 'Ошибка сохранения');
      }
    } catch (error) {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Настройки Jira</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <div className="modal-body">
          {/* Connection Status */}
          {connectionStatus.status !== 'idle' && (
            <div className={`connection-status ${connectionStatus.status}`}>
              {connectionStatus.status === 'loading' && 'Проверка...'}
              {connectionStatus.status === 'success' && `${connectionStatus.message}`}
              {connectionStatus.status === 'error' && `${connectionStatus.message}`}
            </div>
          )}

          {/* Settings Form */}
          <div className="settings-section">
            <h3>Подключение</h3>

            <div className="form-group">
              <label>URL Jira</label>
              <input
                type="url"
                value={config.baseUrl}
                onChange={e => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://jira.example.com"
              />
            </div>

            <div className="form-group">
              <label>Логин (username)</label>
              <input
                type="text"
                value={config.email}
                onChange={e => setConfig(prev => ({ ...prev, email: e.target.value }))}
                placeholder="vignatov"
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                Ваш логин в Jira (не email!)
              </small>
            </div>

            <div className="form-group">
              <label>Пароль</label>
              <input
                type="password"
                value={config.apiToken}
                onChange={e => setConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                placeholder="Пароль от Jira"
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                Используется session-based аутентификация
              </small>
            </div>

            <button
              className="btn btn-secondary"
              onClick={handleTestConnection}
              disabled={testing}
              style={{ width: '100%', marginTop: '8px' }}
            >
              {testing ? 'Проверка...' : 'Проверить подключение'}
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
