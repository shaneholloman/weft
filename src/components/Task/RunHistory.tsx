import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ScheduledRun } from '../../types';
import * as api from '../../api/client';
import './RunHistory.css';

interface RunHistoryProps {
  boardId: string;
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

export function RunHistory({ boardId, taskId, isOpen, onClose }: RunHistoryProps) {
  const [runs, setRuns] = useState<ScheduledRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getScheduledRuns(boardId, taskId);
      if (result.success && result.data) {
        setRuns(result.data);
      } else {
        setError(result.error?.message || 'Failed to load runs');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
    } finally {
      setIsLoading(false);
    }
  }, [boardId, taskId]);

  useEffect(() => {
    if (isOpen) {
      fetchRuns();
    }
  }, [isOpen, fetchRuns]);

  const handleToggleRun = (runId: string) => {
    setExpandedRunId(expandedRunId === runId ? null : runId);
  };

  const handleDeleteRun = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await api.deleteScheduledRun(boardId, runId);
      if (result.success) {
        setRuns(prev => prev.filter(r => r.id !== runId));
      }
    } catch (err) {
      console.error('Failed to delete run:', err);
    }
  };

  if (!isOpen) return null;

  const preventDrag = (e: React.DragEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function renderContent() {
    if (isLoading) return <div className="run-history-loading">Loading runs...</div>;
    if (error) return <div className="run-history-error">{error}</div>;
    if (runs.length === 0) return <div className="run-history-empty">No runs yet</div>;

    return (
      <div className="run-history-list">
        {runs.map((run) => (
          <div key={run.id} className={`run-history-item ${run.status}`}>
            <div
              className="run-history-item-header"
              onClick={() => handleToggleRun(run.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleToggleRun(run.id)}
            >
              <div className="run-history-item-left">
                <span className={`run-history-status ${run.status}`}>
                  {run.status === 'completed' && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
                    </svg>
                  )}
                  {run.status === 'failed' && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
                    </svg>
                  )}
                  {(run.status === 'running' || run.status === 'pending') && (
                    <svg className="spinning" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z" opacity="0.3"/>
                      <path d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0z"/>
                    </svg>
                  )}
                </span>
                <span className="run-history-date">
                  {formatDate(run.createdAt)}
                </span>
              </div>
              <div className="run-history-item-right">
                <button
                  className="run-history-delete"
                  onClick={(e) => handleDeleteRun(run.id, e)}
                  title="Delete run"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
                  </svg>
                </button>
                {run.tasksCreated > 0 && (
                  <span className="run-history-task-count">
                    {run.tasksCreated} task{run.tasksCreated !== 1 ? 's' : ''}
                  </span>
                )}
                <svg
                  className={`run-history-chevron ${expandedRunId === run.id ? 'expanded' : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/>
                </svg>
              </div>
            </div>

            {expandedRunId === run.id && (
              <div className="run-history-item-body">
                {run.error && (
                  <div className="run-history-error-inline">{run.error}</div>
                )}
                {run.childTasksInfo && run.childTasksInfo.length > 0 ? (
                  <div className="run-history-task-list">
                    {run.childTasksInfo.map((task) => (
                      <div key={task.id} className="run-history-task-item">
                        {task.title}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="run-history-no-tasks">No tasks created</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return createPortal(
    <div
      className="run-history-overlay"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={preventDrag}
      onDragOver={preventDrag}
      onDrop={preventDrag}
    >
      <div className="run-history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="run-history-header">
          <h3>Run History</h3>
          <button className="run-history-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
            </svg>
          </button>
        </div>

        <div className="run-history-content">
          {renderContent()}
        </div>
      </div>
    </div>,
    document.body
  );
}
