import { useState, useEffect, useRef } from 'react';
import { Button } from '../common';
import type { WorkflowPlan, WorkflowStep as WorkflowStepType, WorkflowArtifact, Task } from '../../types';
import { useBoard } from '../../context/BoardContext';
import './Workflow.css';

interface WorkflowProgressProps {
  plan: WorkflowPlan;
  onCancel?: () => void;
  onDismiss?: () => void;
  onReviewCheckpoint?: () => void;
  onViewEmail?: (artifact: WorkflowArtifact) => void;
  // For scheduled tasks - show child tasks created
  childTasks?: Task[];
  onViewTask?: (task: Task) => void;
  // If true, this is a scheduled task's last run (hide artifacts, change Clear to Dismiss)
  isScheduledTask?: boolean;
}

export function WorkflowProgress({
  plan,
  onCancel,
  onDismiss,
  onReviewCheckpoint,
  onViewEmail,
  childTasks,
  onViewTask,
  isScheduledTask,
}: WorkflowProgressProps) {
  const { getWorkflowLogs, fetchWorkflowLogs } = useBoard();
  const [expanded, setExpanded] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(!isScheduledTask);
  const [childTasksExpanded, setChildTasksExpanded] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [artifactsDropdownOpen, setArtifactsDropdownOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  const logs = getWorkflowLogs(plan.id);

  useEffect(() => {
    const loadLogs = async () => {
      await fetchWorkflowLogs(plan.boardId, plan.id);
      setLogsLoading(false);
    };
    loadLogs();
  }, [plan.boardId, plan.id, fetchWorkflowLogs]);

  useEffect(() => {
    if (expanded && logsExpanded) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, expanded, logsExpanded]);

  useEffect(() => {
    if (expanded && plan.steps?.length) {
      stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [plan.steps, expanded]);

  useEffect(() => {
    if (!confirmingClear) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (clearButtonRef.current && !clearButtonRef.current.contains(e.target as Node)) {
        setConfirmingClear(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [confirmingClear]);

  const getStatusIcon = () => {
    switch (plan.status) {
      case 'planning':
      case 'draft':
        return '\u25CB'; // Empty circle
      case 'executing':
        return '\u25D4'; // Circle with right half
      case 'checkpoint':
        return '\u23F8'; // Pause
      case 'completed':
        return '\u25CF'; // Filled circle (matches execution)
      case 'failed':
        return '\u2717'; // X
      default:
        return '\u25CB';
    }
  };

  const getStatusLabel = () => {
    switch (plan.status) {
      case 'planning':
        return 'Starting';
      case 'draft':
        return 'Ready';
      case 'approved':
        return 'Ready';
      case 'executing':
        return 'Working';
      case 'checkpoint':
        return 'Paused';
      case 'completed':
        return 'Done';
      case 'failed':
        return 'Failed';
      default:
        return plan.status;
    }
  };

  const isRunning = plan.status === 'executing' || plan.status === 'planning';
  const isComplete = plan.status === 'completed';
  const hasFailed = plan.status === 'failed';
  const isPaused = plan.status === 'checkpoint';

  const latestLog = logs[logs.length - 1];
  const currentStep = plan.steps?.[plan.currentStepIndex || 0];

  const filteredSteps = (plan.steps || []).filter((step) => {
    if (step.type === 'tool' || step.type === 'checkpoint' || step.type === 'tool_call') {
      return true;
    }
    const name = step.name.toLowerCase();
    if (name.includes('thinking') || name.startsWith('now i')) {
      return false;
    }
    if (name.includes('done') || name.includes('complete') || name.includes('finished')) {
      return true;
    }
    if (step.type === 'agent') {
      return false;
    }
    return true;
  });

  const getStepDuration = (step: WorkflowStepType): string | null => {
    if (step.durationMs) {
      return `${(step.durationMs / 1000).toFixed(1)}s`;
    }
    if (step.status === 'running' && step.startedAt) {
      const elapsed = Date.now() - new Date(step.startedAt).getTime();
      return `${(elapsed / 1000).toFixed(1)}s`;
    }
    return null;
  };

  return (
    <div className={`workflow-progress ${expanded ? 'expanded' : ''}`}>
      {/* Compact status bar */}
      <div className="workflow-progress-compact">
        <div className={`workflow-progress-indicator status-${plan.status}`}>
          <span className="workflow-progress-icon">{getStatusIcon()}</span>
          <span className="workflow-progress-label">{getStatusLabel()}</span>
        </div>

        <div className="workflow-progress-preview" onClick={() => setExpanded(!expanded)}>
          {logsLoading ? (
            <span className="preview-text muted">Loading...</span>
          ) : latestLog ? (
            <span className="preview-text">{latestLog.message}</span>
          ) : currentStep ? (
            <span className="preview-text">{currentStep.name}</span>
          ) : (
            <span className="preview-text muted">
              {isRunning ? 'Starting...' : 'No activity'}
            </span>
          )}
          <span className="preview-expand">{expanded ? '\u25BC' : '\u25C0'}</span>
        </div>

        <div className="workflow-progress-actions">
          {isRunning && onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {isPaused && onReviewCheckpoint && (
            <Button variant="primary" size="sm" onClick={onReviewCheckpoint}>
              Review
            </Button>
          )}
          {/* Artifact button/dropdown - hidden for scheduled tasks (artifacts are on child tasks) */}
          {!isScheduledTask && isComplete && plan.result?.artifacts && plan.result.artifacts.length > 0 && (
            <ArtifactButton
              artifacts={plan.result.artifacts}
              isOpen={artifactsDropdownOpen}
              onToggle={() => setArtifactsDropdownOpen(!artifactsDropdownOpen)}
              onClose={() => setArtifactsDropdownOpen(false)}
              onSelectEmail={onViewEmail}
            />
          )}
          {(isComplete || hasFailed) && onDismiss && (
            <Button
              ref={clearButtonRef}
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirmingClear) {
                  onDismiss();
                  setConfirmingClear(false);
                } else {
                  setConfirmingClear(true);
                }
              }}
            >
              {confirmingClear ? 'Confirm?' : isScheduledTask ? 'Dismiss' : 'Clear'}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded panel with steps and logs */}
      {expanded && (
        <div className="workflow-progress-panel">
          {/* Child tasks section - for scheduled tasks that created child tasks */}
          {childTasks && childTasks.length > 0 && (
            <div className="workflow-progress-child-tasks">
              <button
                className="child-tasks-toggle"
                onClick={() => setChildTasksExpanded(!childTasksExpanded)}
              >
                <span className="child-tasks-toggle-icon">{childTasksExpanded ? '▼' : '▶'}</span>
                <span className="child-tasks-toggle-label">
                  Created {childTasks.length} task{childTasks.length !== 1 ? 's' : ''}
                </span>
              </button>
              {childTasksExpanded && (
                <div className="child-tasks-list">
                  {childTasks.map((task) => (
                    <button
                      key={task.id}
                      className="child-task-row"
                      onClick={() => onViewTask?.(task)}
                    >
                      <span className="child-task-title">{task.title}</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/>
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Steps section - collapsible, collapsed by default for scheduled tasks */}
          {(filteredSteps.length > 0 || isRunning) && (
            <div className="workflow-progress-steps">
              <button
                className="steps-toggle"
                onClick={() => setStepsExpanded(!stepsExpanded)}
              >
                <span className="steps-toggle-icon">{stepsExpanded ? '▼' : '▶'}</span>
                <span className="steps-toggle-label">
                  {stepsExpanded ? 'Hide Steps' : 'Show Steps'}
                </span>
                {filteredSteps.length > 0 && (
                  <span className="steps-toggle-count">({filteredSteps.length})</span>
                )}
              </button>
              {stepsExpanded && (
                <div className="steps-list">
                  {filteredSteps.length === 0 && isRunning ? (
                    <div className="step-row status-running">
                      <span className="step-row-icon">{'\u25D4'}</span>
                      <span className="step-row-name">Starting...</span>
                    </div>
                  ) : (
                    filteredSteps.map((step) => {
                      const isToolStep = step.type === 'tool' || step.type === 'checkpoint' || step.type === 'tool_call';
                      const stepIcon = getStepIcon(step.status);
                      return (
                        <div
                          key={step.id}
                          className={`step-row status-${step.status} ${isToolStep ? 'tool-step' : ''}`}
                        >
                          <span className="step-row-icon">{stepIcon}</span>
                          <span className="step-row-name">{step.name}</span>
                          {step.mcpServer && (
                            <span className="step-row-server">{step.mcpServer}</span>
                          )}
                          <span className="step-row-duration">
                            {getStepDuration(step) || ''}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={stepsEndRef} />
                </div>
              )}
            </div>
          )}

          {/* Logs section - collapsible, starts collapsed */}
          <div className="workflow-progress-logs">
            <button
              className="logs-toggle"
              onClick={() => setLogsExpanded(!logsExpanded)}
            >
              <span className="logs-toggle-icon">{logsExpanded ? '▼' : '▶'}</span>
              <span className="logs-toggle-label">
                {logsExpanded ? 'Hide Logs' : 'Show Logs'}
              </span>
              {logs.length > 0 && (
                <span className="logs-toggle-count">({logs.length})</span>
              )}
            </button>
            {logsExpanded && (
              logs.length === 0 ? (
                <div className="logs-empty">
                  {isRunning ? 'Waiting for logs...' : 'No logs available'}
                </div>
              ) : (
                <div className="logs-list">
                  {logs.map((log) => {
                    const isLongMessage = log.message.length > 250;
                    const isExpanded = expandedLogs.has(log.id);
                    const displayMessage = isLongMessage && !isExpanded
                      ? log.message.substring(0, 250)
                      : log.message;

                    return (
                      <div key={log.id} className={`log-entry log-${log.level}`}>
                        <span className="log-time">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <span className="log-msg">
                          {displayMessage}
                          {isLongMessage && !isExpanded && (
                            <button
                              className="log-show-more"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLogs(prev => new Set(prev).add(log.id));
                              }}
                            >
                              show more
                            </button>
                          )}
                        </span>
                        {log.metadata?.type === 'tool_call' && log.metadata.args && (
                          <div className="log-details">
                            <code>{JSON.stringify(log.metadata.args, null, 2)}</code>
                          </div>
                        )}
                        {log.metadata?.type === 'tool_result' && log.metadata.durationMs && (
                          <span className="log-duration">
                            {(log.metadata.durationMs / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              )
            )}
          </div>

        </div>
      )}

    </div>
  );
}

function getPRNumber(url: string): string | null {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? match[1] : null;
}

function truncateTitle(title: string, maxLen = 30): string {
  return title.length <= maxLen ? title : title.slice(0, maxLen) + '...';
}

function getStepIcon(status: WorkflowStepType['status']): string {
  switch (status) {
    case 'pending':
      return '\u25CB'; // Empty circle
    case 'running':
      return '\u25D4'; // Circle with right half
    case 'completed':
      return '\u2713'; // Check
    case 'failed':
      return '\u2717'; // X
    case 'awaiting_approval':
      return '\u23F8'; // Pause
    default:
      return '\u25CB';
  }
}

const ArtifactIcons = {
  google_doc: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
    </svg>
  ),
  google_sheet: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
      <line x1="15" y1="3" x2="15" y2="21"/>
    </svg>
  ),
  gmail_message: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  ),
  github_pr: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  ),
  file: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
    </svg>
  ),
  other: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
    </svg>
  ),
};

function ArtifactButton({
  artifacts,
  isOpen,
  onToggle,
  onClose,
  onSelectEmail,
}: {
  artifacts: WorkflowArtifact[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelectEmail?: (artifact: WorkflowArtifact) => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Position below the button, aligned to right edge
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 280), // 280px menu width, 8px min margin
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (artifacts.length === 1) {
    const artifact = artifacts[0];
    const icon = ArtifactIcons[artifact.type as keyof typeof ArtifactIcons] || ArtifactIcons.other;
    const prNumber = artifact.type === 'github_pr' && artifact.url ? getPRNumber(artifact.url) : null;

    if (artifact.type === 'gmail_message' && artifact.content && onSelectEmail) {
      return (
        <button
          className="workflow-artifact-link"
          onClick={() => onSelectEmail(artifact)}
        >
          {icon}
          <span className="artifact-title">{truncateTitle(artifact.title || 'View Email', 30)}</span>
        </button>
      );
    }

    return (
      <a
        href={artifact.url}
        target="_blank"
        rel="noopener noreferrer"
        className="workflow-artifact-link"
      >
        {icon}
        {prNumber && <span className="artifact-pr-number">#{prNumber}</span>}
        <span className="artifact-title">{truncateTitle(artifact.title || 'View', 30)}</span>
      </a>
    );
  }

  const firstIcon = ArtifactIcons[artifacts[0].type as keyof typeof ArtifactIcons] || ArtifactIcons.other;

  return (
    <div className="workflow-artifacts-dropdown">
      <button ref={buttonRef} className="workflow-artifact-link" onClick={onToggle}>
        {firstIcon}
        <span className="artifact-title">{artifacts.length} artifacts</span>
        <span className="artifact-dropdown-caret">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>

      {isOpen && menuPosition && (
        <div
          ref={dropdownRef}
          className="workflow-artifacts-menu workflow-artifacts-menu-fixed"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          {artifacts.map((artifact, i) => {
            const icon = ArtifactIcons[artifact.type as keyof typeof ArtifactIcons] || ArtifactIcons.other;
            const prNumber = artifact.type === 'github_pr' && artifact.url ? getPRNumber(artifact.url) : null;

            if (artifact.type === 'gmail_message' && artifact.content && onSelectEmail) {
              return (
                <button
                  key={i}
                  className="workflow-artifacts-menu-item"
                  onClick={() => {
                    onSelectEmail(artifact);
                    onClose();
                  }}
                >
                  {icon}
                  <span>{artifact.title || 'View Email'}</span>
                </button>
              );
            }

            return (
              <a
                key={i}
                href={artifact.url}
                target="_blank"
                rel="noopener noreferrer"
                className="workflow-artifacts-menu-item"
                onClick={onClose}
              >
                {icon}
                {prNumber && <span className="artifact-pr-number">#{prNumber}</span>}
                <span>{artifact.title || 'View'}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Small badge to show workflow status on task cards
 */
export function WorkflowBadge({
  status,
  artifactType
}: {
  status: string;
  artifactType?: string;
}) {
  if (status === 'completed' && artifactType) {
    if (artifactType === 'google_doc') {
      return (
        <span className="workflow-badge badge-artifact" title="Google Doc created">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
          </svg>
        </span>
      );
    }
    if (artifactType === 'gmail_message') {
      return (
        <span className="workflow-badge badge-artifact" title="Email sent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
        </span>
      );
    }
    if (artifactType === 'github_pr') {
      return (
        <span className="workflow-badge badge-artifact" title="Pull Request created">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </span>
      );
    }
    if (artifactType === 'google_sheet') {
      return (
        <span className="workflow-badge badge-artifact" title="Google Sheet updated">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </span>
      );
    }
  }

  const getIcon = () => {
    switch (status) {
      case 'planning':
      case 'draft':
        return '\u25CB';
      case 'executing':
        return '\u25D4';
      case 'checkpoint':
        return '\u23F8';
      case 'completed':
        return '\u25CF';
      case 'failed':
        return '\u2717';
      default:
        return '\u25CB';
    }
  };

  return (
    <span className={`workflow-badge badge-${status}`} title={`Workflow: ${status}`}>
      {getIcon()}
    </span>
  );
}
