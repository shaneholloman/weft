import { useState, useEffect, useRef, type DragEvent, type MouseEvent } from 'react';
import type { Task, ScheduleConfig } from '../../types';
import { useBoard } from '../../context/BoardContext';
import { TaskModal } from './TaskModal';
import { WorkflowBadge } from '../Workflow';
import './TaskCard.css';

/** Strip markdown syntax (pills and links) to plain text for card preview */
function stripMarkdownToText(text: string): string {
  return text
    // [pill:type:title](url) -> title
    .replace(/\[pill:[^:]+:([^\]]+)\]\([^)]+\)/g, '$1')
    // [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/** Format schedule frequency for display */
function formatScheduleFrequency(config: ScheduleConfig): string {
  const time = config.time;
  const timeParts = time.split(':');
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  const displayTime = minutes === 0
    ? `${displayHours}${ampm}`
    : `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;

  // Get short timezone
  const tz = config.timezone.split('/').pop()?.replace('_', ' ') || config.timezone;

  if (config.frequency === 'daily') {
    return `Daily ${displayTime} ${tz}`;
  }
  if (config.frequency === 'weekly' && config.daysOfWeek) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayStr = config.daysOfWeek.map(d => days[d]).join(', ');
    return `${dayStr} ${displayTime}`;
  }
  return `${displayTime} ${tz}`;
}

interface TaskCardProps {
  task: Task;
  index: number;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

export function TaskCard({ task }: TaskCardProps) {
  const { setDragState, moveTask, getTasksByColumn, deleteTask, activeBoard, getTaskWorkflowPlan, getTaskById } = useBoard();

  // Get parent task name if this is a child task
  const parentTask = task.parentTaskId ? getTaskById(task.parentTaskId) : null;
  const [isDragging, setIsDragging] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Get workflow from context (single source of truth)
  const workflowPlan = getTaskWorkflowPlan(task.id);

  // Listen for open-task events from header executions dropdown
  useEffect(() => {
    const handleOpenTask = (e: CustomEvent<{ taskId: string }>) => {
      if (e.detail.taskId === task.id) {
        setShowModal(true);
      }
    };

    window.addEventListener('open-task', handleOpenTask as EventListener);
    return () => {
      window.removeEventListener('open-task', handleOpenTask as EventListener);
    };
  }, [task.id]);

  const handleModalClose = () => {
    setShowModal(false);
  };

  const handleDragStart = (e: DragEvent) => {
    e.stopPropagation(); // Prevent column drag from triggering
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    setDragState({
      isDragging: true,
      taskId: task.id,
      sourceColumnId: task.columnId,
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragState({
      isDragging: false,
      taskId: null,
      sourceColumnId: null,
    });
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const draggedTaskId = e.dataTransfer.getData('text/plain');
    if (draggedTaskId && draggedTaskId !== task.id) {
      const tasks = getTasksByColumn(task.columnId);
      const targetIndex = tasks.findIndex((t) => t.id === task.id);
      await moveTask(draggedTaskId, task.columnId, targetIndex);
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  };

  const handleDelete = async () => {
    closeContextMenu();
    await deleteTask(task.id);
  };

  const handleMoveToColumn = async (columnId: string) => {
    closeContextMenu();
    const tasksInColumn = getTasksByColumn(columnId);
    await moveTask(task.id, columnId, tasksInColumn.length);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        closeContextMenu();
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.isOpen]);

  // Get other columns for move menu
  const otherColumns = activeBoard?.columns.filter((c) => c.id !== task.columnId) || [];

  return (
    <>
      <div
        className={`task-card ${isDragging ? 'dragging' : ''} ${task.scheduleConfig?.enabled ? 'scheduled' : ''} ${task.parentTaskId ? 'child-task' : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => setShowModal(true)}
        onContextMenu={handleContextMenu}
      >
        <div className="task-card-header">
          <span className="task-title">{task.title}</span>
          <div className="task-card-badges">
            {task.scheduleConfig?.enabled && (
              <span className="schedule-badge" title={formatScheduleFrequency(task.scheduleConfig)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM8 3.5a.75.75 0 0 0-.75.75v4l3.22 2.15a.75.75 0 1 0 .83-1.25L8.75 7.4V4.25A.75.75 0 0 0 8 3.5z"/>
                </svg>
              </span>
            )}
            {workflowPlan && (!task.scheduleConfig?.enabled || workflowPlan.status === 'executing') && (
              <WorkflowBadge
                status={workflowPlan.status}
                artifactType={workflowPlan.result?.artifacts?.[0]?.type}
              />
            )}
          </div>
        </div>
        {task.description && (
          <span className="task-description">{stripMarkdownToText(task.description)}</span>
        )}
        {parentTask && (
          <span className="task-parent-link">
            ↳ {parentTask.title}
          </span>
        )}
        {task.scheduleConfig?.enabled && (
          <span className="task-schedule-info">
            {formatScheduleFrequency(task.scheduleConfig)}
          </span>
        )}
      </div>

      {contextMenu.isOpen && (
        <div
          ref={contextMenuRef}
          className="task-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className="context-menu-item" onClick={() => { closeContextMenu(); setShowModal(true); }}>
            Edit
          </button>
          {otherColumns.length > 0 && (
            <>
              <div className="context-menu-divider" />
              {otherColumns.map((column) => (
                <button
                  key={column.id}
                  className="context-menu-item"
                  onClick={() => handleMoveToColumn(column.id)}
                >
                  Move to {column.name}
                </button>
              ))}
            </>
          )}
          <div className="context-menu-divider" />
          <button className="context-menu-item danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      )}

      <TaskModal
        task={task}
        isOpen={showModal}
        onClose={handleModalClose}
      />
    </>
  );
}
