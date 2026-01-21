import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import './Modal.css';

interface FetchJiraIssueModalProps {
  onClose: () => void;
  onSuccess?: (issue: any) => void;
}

export function FetchJiraIssueModal({ onClose, onSuccess }: FetchJiraIssueModalProps) {
  const [issueKey, setIssueKey] = useState('EGISZREMD-15282');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    data?: any;
    message?: string;
  }>({ status: 'idle' });

  const handleFetch = async () => {
    if (!issueKey.trim()) {
      toast.error('Введите ключ Jira задачи');
      return;
    }

    setLoading(true);
    setResult({ status: 'loading' });

    try {
      const response = await window.api.getJiraIssue(issueKey);

      if (response.success && response.issue) {
        setResult({
          status: 'success',
          data: response.issue,
          message: `Задача ${issueKey} загружена успешно`,
        });
        toast.success(`Задача ${issueKey} загружена успешно`);
        if (onSuccess) {
          onSuccess(response.issue);
        }
      } else {
        setResult({
          status: 'error',
          message: response.error || 'Ошибка при загрузке задачи',
        });
        toast.error(response.error || 'Ошибка при загрузке задачи');
      }
    } catch (error) {
      const errorMsg = String(error);
      setResult({
        status: 'error',
        message: errorMsg,
      });
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleFetch();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>Загрузить задачу из Jira</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Ключ задачи (например, EGISZREMD-15282)</label>
            <input
              type="text"
              value={issueKey}
              onChange={e => setIssueKey(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="EGISZREMD-15282"
              disabled={loading}
              style={{ marginBottom: '8px' }}
            />
          </div>

          {result.status !== 'idle' && (
            <div className={`connection-status ${result.status}`}>
              {result.status === 'loading' && 'Загрузка...'}
              {result.status === 'success' && result.message}
              {result.status === 'error' && result.message}
            </div>
          )}

          {result.status === 'success' && result.data && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              fontSize: '13px',
              lineHeight: '1.6',
              maxHeight: '300px',
              overflowY: 'auto',
            }}>
              <div><strong>Ключ:</strong> {result.data.key}</div>
              <div><strong>Название:</strong> {result.data.summary}</div>
              <div><strong>Статус:</strong> {result.data.status}</div>
              <div><strong>Приоритет:</strong> {result.data.priority}</div>
              <div><strong>Тип:</strong> {result.data.issueType}</div>
              {result.data.assignee && <div><strong>Ответственный:</strong> {result.data.assignee}</div>}
              {result.data.description && (
                <div>
                  <strong>Описание:</strong>
                  <div style={{ marginTop: '4px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {result.data.description.substring(0, 500)}
                    {result.data.description.length > 500 && '...'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={handleFetch}
            disabled={loading || !issueKey.trim()}
          >
            {loading ? 'Загрузка...' : 'Загрузить'}
          </button>
        </div>
      </div>
    </div>
  );
}
