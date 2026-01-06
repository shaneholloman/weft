import { useState, useEffect, useRef, type DragEvent } from 'react';
import type { Column as ColumnType } from '../../types';
import { useBoard } from '../../context/BoardContext';
import { useIsMobile } from '../../hooks';
import { TaskCard } from '../Task/TaskCard';
import { Button, Input } from '../common';
import './Column.css';

interface ColumnProps {
  column: ColumnType;
  onStartEdit?: () => void;
  onColumnDragStart?: (e: DragEvent) => void;
  onColumnDragEnd?: () => void;
  isColumnDragTarget?: boolean;
}

export function Column({ column, onStartEdit, onColumnDragStart, onColumnDragEnd, isColumnDragTarget }: ColumnProps) {
  const { getTasksByColumn, createTask, moveTask, setDragState, dragState, addingToColumn, setAddingToColumn, updateColumn, deleteColumn } = useBoard();
  const isMobile = useIsMobile();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(column.name);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdding = addingToColumn === column.id;
  const tasks = getTasksByColumn(column.id);

  // Focus input when triggered by keyboard shortcut
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Focus name input when editing
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Trigger edit mode from parent (for new columns)
  useEffect(() => {
    if (onStartEdit) {
      setIsEditingName(true);
      setEditedName(column.name);
    }
  }, [onStartEdit, column.name]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setConfirmingDelete(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleSaveName = async () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== column.name) {
      await updateColumn(column.id, { name: trimmed });
    }
    setIsEditingName(false);
    setEditedName(column.name);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName(column.name);
  };

  const handleDeleteColumn = async () => {
    await deleteColumn(column.id);
    setShowMenu(false);
    setConfirmingDelete(false);
  };

  const setIsAdding = (value: boolean) => {
    setAddingToColumn(value ? column.id : null);
  };

  const handleAddTask = async () => {
    if (newTaskTitle.trim()) {
      await createTask(column.id, newTaskTitle.trim());
      setNewTaskTitle('');
      setIsAdding(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    // Only set to false if we're leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      // Handle both cross-column moves and same-column drops to end
      // For same-column, calculate position accounting for the dragged item
      const isSameColumn = dragState.sourceColumnId === column.id;
      const draggedTask = tasks.find(t => t.id === taskId);
      const draggedIndex = draggedTask ? tasks.indexOf(draggedTask) : -1;

      // Target position is end of list, but if same column and item was before end,
      // the effective end position is one less (since the dragged item leaves a gap)
      let targetPosition = tasks.length;
      if (isSameColumn && draggedIndex >= 0) {
        targetPosition = tasks.length - 1;
      }

      // Only move if actually changing position
      if (!isSameColumn || draggedIndex !== targetPosition) {
        await moveTask(taskId, column.id, targetPosition);
      }
    }

    setDragState({ isDragging: false, taskId: null, sourceColumnId: null });
  };

  return (
    <div
      className={`column ${isDragOver ? 'column-drag-over' : ''} ${isColumnDragTarget ? 'column-drop-target' : ''}`}
      draggable={!isEditingName && !isMobile}
      onDragStart={(e) => {
        // Prevent column drag if editing name
        if (isEditingName) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('application/column', column.id);
        e.dataTransfer.effectAllowed = 'move';
        onColumnDragStart?.(e);
      }}
      onDragEnd={onColumnDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="column-header">
        <span className="column-prompt">&gt;</span>
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            className="column-name-input"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveName();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            onBlur={handleSaveName}
          />
        ) : (
          <span
            className="column-name"
            onClick={() => {
              setIsEditingName(true);
              setEditedName(column.name);
            }}
            title="Click to rename"
          >
            {column.name}
          </span>
        )}
        <span className="column-count">{tasks.length}</span>

        <div className="column-menu-wrapper" ref={menuRef}>
          <button
            className="column-menu-btn"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Column options"
          >
            ⋮
          </button>
          {showMenu && (
            <div className="column-menu">
              {confirmingDelete ? (
                <div className="column-menu-confirm">
                  <span className="column-menu-confirm-text">
                    {tasks.length > 0
                      ? `Delete column and ${tasks.length} task${tasks.length === 1 ? '' : 's'}?`
                      : 'Delete empty column?'}
                  </span>
                  <div className="column-menu-confirm-actions">
                    <button
                      className="column-menu-item column-menu-item-danger"
                      onClick={handleDeleteColumn}
                    >
                      Delete
                    </button>
                    <button
                      className="column-menu-item"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="column-menu-item"
                    onClick={() => {
                      setShowMenu(false);
                      setIsEditingName(true);
                      setEditedName(column.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="column-menu-item column-menu-item-danger"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="column-tasks">
        {tasks.map((task, index) => (
          <TaskCard key={task.id} task={task} index={index} />
        ))}

        {isAdding ? (
          <div className="column-add-form">
            <Input
              ref={inputRef}
              placeholder="Task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTask();
                if (e.key === 'Escape') {
                  setIsAdding(false);
                  setNewTaskTitle('');
                }
              }}
              autoFocus
            />
            <div className="column-add-actions">
              <Button size="sm" variant="primary" onClick={handleAddTask}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAdding(false);
                  setNewTaskTitle('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button className="column-add-btn" onClick={() => setIsAdding(true)}>
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}
