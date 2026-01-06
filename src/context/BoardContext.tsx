import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import type { Column, Task, DragState, ColumnDragState, TaskPriority, WorkflowPlan, WorkflowLog } from '../types';
import * as api from '../api/client';
import { boardReducer, initialBoardState, type BoardState } from './boardReducer';

// ============================================
// CONTEXT
// ============================================

interface BoardContextValue extends Omit<BoardState, 'workflowLogs'> {
  loadBoards: () => Promise<void>;
  loadBoard: (id: string) => Promise<void>;
  clearActiveBoard: () => void;
  createBoard: (name: string) => Promise<string | null>;
  renameBoard: (id: string, name: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  createColumn: (name: string) => Promise<Column | null>;
  updateColumn: (id: string, data: { name?: string; position?: number }) => Promise<void>;
  deleteColumn: (id: string) => Promise<void>;
  createTask: (columnId: string, title: string, description?: string, priority?: TaskPriority) => Promise<void>;
  updateTask: (id: string, data: { title?: string; description?: string; priority?: TaskPriority }) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  moveTask: (taskId: string, columnId: string, position: number) => Promise<void>;
  moveColumn: (columnId: string, newPosition: number) => Promise<void>;
  setDragState: (state: Partial<DragState>) => void;
  setColumnDragState: (state: Partial<ColumnDragState>) => void;
  getTasksByColumn: (columnId: string) => Task[];
  addingToColumn: string | null;
  setAddingToColumn: (columnId: string | null) => void;
  // Workflow state and methods
  activeWorkflows: WorkflowPlan[];
  wsConnected: boolean;
  getWorkflowPlan: (planId: string) => WorkflowPlan | null;
  getTaskWorkflowPlan: (taskId: string) => WorkflowPlan | null;
  updateWorkflowPlan: (plan: WorkflowPlan) => void;
  removeWorkflowPlan: (planId: string) => void;
  getWorkflowLogs: (planId: string) => WorkflowLog[];
  fetchWorkflowLogs: (boardId: string, planId: string) => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

// ============================================
// PROVIDER
// ============================================

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all workflow plans for the board
  const fetchBoardWorkflowPlans = useCallback(async (boardId: string) => {
    const result = await api.getBoardWorkflowPlans(boardId);
    if (result.success && result.data) {
      dispatch({ type: 'SET_WORKFLOW_PLANS', payload: result.data });
    }
  }, []);

  // WebSocket connection for real-time updates
  const connectWebSocket = useCallback((boardId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?boardId=${encodeURIComponent(boardId)}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onclose = (event) => {
        setWsConnected(false);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (state.activeBoard?.id) {
              connectWebSocket(state.activeBoard.id);
            }
          }, 3000);
        }
      };

      ws.onerror = () => {
        // Error handling done via onclose
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'pong') return;

          if (message.type === 'workflow_plan_update') {
            const plan = message.data as WorkflowPlan;
            dispatch({ type: 'UPDATE_WORKFLOW_PLAN', payload: plan });
          }

          if (message.type === 'workflow_log') {
            const log = message.data as WorkflowLog;
            dispatch({ type: 'ADD_WORKFLOW_LOG', payload: log });
          }
        } catch {
          // Silently ignore malformed messages
        }
      };

      wsRef.current = ws;
    } catch {
      // Connection failure will be handled by onclose/onerror
    }
  }, [state.activeBoard?.id]);

  // Connect WebSocket and fetch data when board changes
  useEffect(() => {
    if (state.activeBoard?.id) {
      dispatch({ type: 'CLEAR_WORKFLOW_STATE' });
      fetchBoardWorkflowPlans(state.activeBoard.id);
      connectWebSocket(state.activeBoard.id);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Board changed');
        wsRef.current = null;
      }
    };
  }, [state.activeBoard?.id, fetchBoardWorkflowPlans, connectWebSocket]);

  // Derived: active workflows (executing, checkpoint, or planning)
  const activeWorkflows = Object.values(state.workflowPlans).filter(
    (p) => p.status === 'executing' || p.status === 'checkpoint' || p.status === 'planning'
  );

  // Get a workflow plan from state by plan ID
  const getWorkflowPlan = useCallback((planId: string): WorkflowPlan | null => {
    return state.workflowPlans[planId] || null;
  }, [state.workflowPlans]);

  // Get workflow plan for a task (searches by taskId)
  const getTaskWorkflowPlan = useCallback((taskId: string): WorkflowPlan | null => {
    const plans = Object.values(state.workflowPlans);
    return plans.find(p => p.taskId === taskId) || null;
  }, [state.workflowPlans]);

  // Update workflow plan in state
  const updateWorkflowPlanAction = useCallback((plan: WorkflowPlan) => {
    dispatch({ type: 'UPDATE_WORKFLOW_PLAN', payload: plan });
  }, []);

  // Remove workflow plan from state
  const removeWorkflowPlanAction = useCallback((planId: string) => {
    dispatch({ type: 'REMOVE_WORKFLOW_PLAN', payload: planId });
  }, []);

  // Get workflow logs from state
  const getWorkflowLogsFromState = useCallback((planId: string): WorkflowLog[] => {
    return state.workflowLogs[planId] || [];
  }, [state.workflowLogs]);

  // Fetch workflow logs from API
  const fetchWorkflowLogs = useCallback(async (boardId: string, planId: string): Promise<void> => {
    const result = await api.getWorkflowLogs(boardId, planId);
    if (result.success && result.data) {
      dispatch({ type: 'SET_WORKFLOW_LOGS', payload: { planId, logs: result.data } });
    }
  }, []);

  const loadBoards = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const result = await api.getBoards();
    if (result.success && result.data) {
      dispatch({ type: 'SET_BOARDS', payload: result.data });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to load boards' });
    }
    dispatch({ type: 'SET_LOADING', payload: false });
  }, []);

  const loadBoard = useCallback(async (id: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const result = await api.getBoard(id);
    if (result.success && result.data) {
      dispatch({ type: 'SET_ACTIVE_BOARD', payload: result.data });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to load board' });
    }
    dispatch({ type: 'SET_LOADING', payload: false });
  }, []);

  const clearActiveBoard = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_BOARD', payload: null });
  }, []);

  const createBoardAction = useCallback(async (name: string): Promise<string | null> => {
    const result = await api.createBoard(name);
    if (result.success && result.data) {
      dispatch({ type: 'ADD_BOARD', payload: result.data });
      return result.data.id;
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to create board' });
      return null;
    }
  }, []);

  const renameBoardAction = useCallback(async (id: string, name: string) => {
    const result = await api.updateBoard(id, { name });
    if (result.success && result.data) {
      dispatch({ type: 'UPDATE_BOARD', payload: { id, name } });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to rename board' });
    }
  }, []);

  const deleteBoardAction = useCallback(async (id: string) => {
    const result = await api.deleteBoard(id);
    if (result.success) {
      dispatch({ type: 'REMOVE_BOARD', payload: id });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to delete board' });
    }
  }, []);

  const createColumnAction = useCallback(async (name: string): Promise<Column | null> => {
    if (!state.activeBoard) return null;
    const result = await api.createColumn(state.activeBoard.id, name);
    if (result.success && result.data) {
      dispatch({ type: 'ADD_COLUMN', payload: result.data });
      return result.data;
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to create column' });
      return null;
    }
  }, [state.activeBoard]);

  const updateColumnAction = useCallback(async (
    id: string,
    data: { name?: string; position?: number }
  ) => {
    if (!state.activeBoard) return;
    const result = await api.updateColumn(state.activeBoard.id, id, data);
    if (result.success && result.data) {
      dispatch({ type: 'UPDATE_COLUMN', payload: result.data });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to update column' });
    }
  }, [state.activeBoard]);

  const deleteColumnAction = useCallback(async (id: string) => {
    if (!state.activeBoard) return;
    const result = await api.deleteColumn(state.activeBoard.id, id);
    if (result.success) {
      dispatch({ type: 'REMOVE_COLUMN', payload: id });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to delete column' });
    }
  }, [state.activeBoard]);

  const createTaskAction = useCallback(async (
    columnId: string,
    title: string,
    description?: string,
    priority?: TaskPriority
  ) => {
    if (!state.activeBoard) return;
    const result = await api.createTask(state.activeBoard.id, {
      columnId,
      title,
      description,
      priority,
    });
    if (result.success && result.data) {
      dispatch({ type: 'ADD_TASK', payload: result.data });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to create task' });
    }
  }, [state.activeBoard]);

  const updateTaskAction = useCallback(async (
    id: string,
    data: { title?: string; description?: string; priority?: TaskPriority }
  ) => {
    if (!state.activeBoard) return;
    const result = await api.updateTask(state.activeBoard.id, id, data);
    if (result.success && result.data) {
      dispatch({ type: 'UPDATE_TASK', payload: result.data });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to update task' });
    }
  }, [state.activeBoard]);

  const deleteTaskAction = useCallback(async (id: string) => {
    if (!state.activeBoard) return;
    const result = await api.deleteTask(state.activeBoard.id, id);
    if (result.success) {
      dispatch({ type: 'REMOVE_TASK', payload: id });
    } else {
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to delete task' });
    }
  }, [state.activeBoard]);

  const moveTaskAction = useCallback(async (
    taskId: string,
    columnId: string,
    position: number
  ) => {
    if (!state.activeBoard) return;
    // Optimistic update
    dispatch({ type: 'MOVE_TASK', payload: { taskId, columnId, position } });

    const result = await api.moveTask(state.activeBoard.id, taskId, columnId, position);
    if (!result.success) {
      // Revert on error by reloading the board
      loadBoard(state.activeBoard.id);
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to move task' });
    }
  }, [state.activeBoard, loadBoard]);

  const setDragState = useCallback((dragState: Partial<DragState>) => {
    dispatch({ type: 'SET_DRAG_STATE', payload: dragState });
  }, []);

  const setColumnDragState = useCallback((columnDragState: Partial<ColumnDragState>) => {
    dispatch({ type: 'SET_COLUMN_DRAG_STATE', payload: columnDragState });
  }, []);

  const moveColumnAction = useCallback(async (columnId: string, newPosition: number) => {
    if (!state.activeBoard) return;

    // Find the column being moved
    const columns = [...state.activeBoard.columns].sort((a, b) => a.position - b.position);
    const columnIndex = columns.findIndex((c) => c.id === columnId);
    if (columnIndex === -1) return;

    // Optimistically update column positions
    const updatedColumns = columns.map((col, idx) => {
      if (col.id === columnId) {
        return { ...col, position: newPosition };
      }
      // Adjust other columns
      if (columnIndex < newPosition) {
        // Moving right: shift columns between old and new position left
        if (idx > columnIndex && idx <= newPosition) {
          return { ...col, position: col.position - 1 };
        }
      } else {
        // Moving left: shift columns between new and old position right
        if (idx >= newPosition && idx < columnIndex) {
          return { ...col, position: col.position + 1 };
        }
      }
      return col;
    });

    // Update local state optimistically
    updatedColumns.forEach((col) => {
      dispatch({ type: 'UPDATE_COLUMN', payload: col });
    });

    // Call API to persist the move
    if (!state.activeBoard) return;
    const result = await api.updateColumn(state.activeBoard.id, columnId, { position: newPosition });
    if (!result.success) {
      // Revert on error by reloading the board
      loadBoard(state.activeBoard.id);
      dispatch({ type: 'SET_ERROR', payload: result.error?.message || 'Failed to move column' });
    }
  }, [state.activeBoard, loadBoard]);

  const getTasksByColumn = useCallback((columnId: string): Task[] => {
    if (!state.activeBoard) return [];
    return state.activeBoard.tasks
      .filter((t) => t.columnId === columnId)
      .sort((a, b) => a.position - b.position);
  }, [state.activeBoard]);

  // Load boards on mount
  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const value: BoardContextValue = {
    boards: state.boards,
    activeBoard: state.activeBoard,
    loading: state.loading,
    error: state.error,
    dragState: state.dragState,
    columnDragState: state.columnDragState,
    workflowPlans: state.workflowPlans,
    loadBoards,
    loadBoard,
    clearActiveBoard,
    createBoard: createBoardAction,
    renameBoard: renameBoardAction,
    deleteBoard: deleteBoardAction,
    createColumn: createColumnAction,
    updateColumn: updateColumnAction,
    deleteColumn: deleteColumnAction,
    createTask: createTaskAction,
    updateTask: updateTaskAction,
    deleteTask: deleteTaskAction,
    moveTask: moveTaskAction,
    moveColumn: moveColumnAction,
    setDragState,
    setColumnDragState,
    getTasksByColumn,
    addingToColumn,
    setAddingToColumn,
    activeWorkflows,
    wsConnected,
    getWorkflowPlan,
    getTaskWorkflowPlan,
    updateWorkflowPlan: updateWorkflowPlanAction,
    removeWorkflowPlan: removeWorkflowPlanAction,
    getWorkflowLogs: getWorkflowLogsFromState,
    fetchWorkflowLogs,
  };

  return (
    <BoardContext.Provider value={value}>
      {children}
    </BoardContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useBoard(): BoardContextValue {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error('useBoard must be used within a BoardProvider');
  }
  return context;
}
