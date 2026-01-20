/**
 * Board reducer - State management logic for BoardContext
 *
 * Extracted from BoardContext.tsx for better maintainability.
 */

import type { Board, Column, Task, DragState, ColumnDragState, WorkflowPlan, WorkflowLog } from '../types';
import type { BoardWithDetails } from '../api/client';

// ============================================
// STATE
// ============================================

export interface BoardState {
  boards: Board[];
  activeBoard: BoardWithDetails | null;
  loading: boolean;
  error: string | null;
  dragState: DragState;
  columnDragState: ColumnDragState;
  // Workflow state - keyed by plan ID
  workflowPlans: Record<string, WorkflowPlan>;
  workflowLogs: Record<string, WorkflowLog[]>;
}

export const initialBoardState: BoardState = {
  boards: [],
  activeBoard: null,
  loading: false,
  error: null,
  dragState: {
    isDragging: false,
    taskId: null,
    sourceColumnId: null,
  },
  columnDragState: {
    isDragging: false,
    columnId: null,
  },
  workflowPlans: {},
  workflowLogs: {},
};

// ============================================
// ACTIONS
// ============================================

export type BoardAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_BOARDS'; payload: Board[] }
  | { type: 'SET_ACTIVE_BOARD'; payload: BoardWithDetails | null }
  | { type: 'ADD_BOARD'; payload: BoardWithDetails }
  | { type: 'UPDATE_BOARD'; payload: { id: string; name: string } }
  | { type: 'REMOVE_BOARD'; payload: string }
  | { type: 'ADD_COLUMN'; payload: Column }
  | { type: 'UPDATE_COLUMN'; payload: Column }
  | { type: 'REMOVE_COLUMN'; payload: string }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'REMOVE_TASK'; payload: string }
  | { type: 'MOVE_TASK'; payload: { taskId: string; columnId: string; position: number } }
  | { type: 'SET_DRAG_STATE'; payload: Partial<DragState> }
  | { type: 'SET_COLUMN_DRAG_STATE'; payload: Partial<ColumnDragState> }
  // Workflow actions
  | { type: 'SET_WORKFLOW_PLANS'; payload: WorkflowPlan[] }
  | { type: 'UPDATE_WORKFLOW_PLAN'; payload: WorkflowPlan }
  | { type: 'REMOVE_WORKFLOW_PLAN'; payload: string }
  | { type: 'ADD_WORKFLOW_LOG'; payload: WorkflowLog }
  | { type: 'SET_WORKFLOW_LOGS'; payload: { planId: string; logs: WorkflowLog[] } }
  | { type: 'CLEAR_WORKFLOW_STATE' };

// ============================================
// REDUCER
// ============================================

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_BOARDS':
      return { ...state, boards: action.payload };

    case 'SET_ACTIVE_BOARD':
      return { ...state, activeBoard: action.payload };

    case 'ADD_BOARD':
      return {
        ...state,
        boards: [action.payload, ...state.boards],
        activeBoard: action.payload,
      };

    case 'UPDATE_BOARD':
      return {
        ...state,
        boards: state.boards.map((b) =>
          b.id === action.payload.id ? { ...b, name: action.payload.name } : b
        ),
        activeBoard:
          state.activeBoard?.id === action.payload.id
            ? { ...state.activeBoard, name: action.payload.name }
            : state.activeBoard,
      };

    case 'REMOVE_BOARD':
      return {
        ...state,
        boards: state.boards.filter((b) => b.id !== action.payload),
        activeBoard:
          state.activeBoard?.id === action.payload ? null : state.activeBoard,
      };

    case 'ADD_COLUMN':
      if (!state.activeBoard) return state;
      return {
        ...state,
        activeBoard: {
          ...state.activeBoard,
          columns: [...state.activeBoard.columns, action.payload],
        },
      };

    case 'UPDATE_COLUMN':
      if (!state.activeBoard) return state;
      return {
        ...state,
        activeBoard: {
          ...state.activeBoard,
          columns: state.activeBoard.columns.map((c) =>
            c.id === action.payload.id ? action.payload : c
          ),
        },
      };

    case 'REMOVE_COLUMN':
      if (!state.activeBoard) return state;
      return {
        ...state,
        activeBoard: {
          ...state.activeBoard,
          columns: state.activeBoard.columns.filter((c) => c.id !== action.payload),
          tasks: state.activeBoard.tasks.filter((t) => t.columnId !== action.payload),
        },
      };

    case 'ADD_TASK':
      if (!state.activeBoard) return state;
      // Deduplicate: don't add if task already exists (can happen when API response and WebSocket both fire)
      if (state.activeBoard.tasks.some((t) => t.id === action.payload.id)) {
        return state;
      }
      return {
        ...state,
        activeBoard: {
          ...state.activeBoard,
          tasks: [...state.activeBoard.tasks, action.payload],
        },
      };

    case 'UPDATE_TASK':
      if (!state.activeBoard) return state;
      return {
        ...state,
        activeBoard: {
          ...state.activeBoard,
          tasks: state.activeBoard.tasks.map((t) =>
            t.id === action.payload.id ? action.payload : t
          ),
        },
      };

    case 'REMOVE_TASK':
      if (!state.activeBoard) return state;
      return {
        ...state,
        activeBoard: {
          ...state.activeBoard,
          tasks: state.activeBoard.tasks.filter((t) => t.id !== action.payload),
        },
      };

    case 'MOVE_TASK': {
      if (!state.activeBoard) return state;
      const { taskId, columnId: targetColumnId, position: newPosition } = action.payload;
      const movedTask = state.activeBoard.tasks.find(t => t.id === taskId);
      if (!movedTask) return state;

      const sourceColumnId = movedTask.columnId;
      const oldPosition = movedTask.position;

      return {
        ...state,
        activeBoard: {
          ...state.activeBoard,
          tasks: state.activeBoard.tasks.map((t) => {
            if (t.id === taskId) {
              return { ...t, columnId: targetColumnId, position: newPosition };
            }

            if (sourceColumnId === targetColumnId) {
              // Same column reorder
              if (oldPosition < newPosition) {
                // Moving down: shift tasks between old and new up (decrement)
                if (t.columnId === targetColumnId && t.position > oldPosition && t.position <= newPosition) {
                  return { ...t, position: t.position - 1 };
                }
              } else if (oldPosition > newPosition) {
                // Moving up: shift tasks between new and old down (increment)
                if (t.columnId === targetColumnId && t.position >= newPosition && t.position < oldPosition) {
                  return { ...t, position: t.position + 1 };
                }
              }
            } else {
              // Cross-column move
              // Close gap in source column
              if (t.columnId === sourceColumnId && t.position > oldPosition) {
                return { ...t, position: t.position - 1 };
              }
              // Make room in target column
              if (t.columnId === targetColumnId && t.position >= newPosition) {
                return { ...t, position: t.position + 1 };
              }
            }

            return t;
          }),
        },
      };
    }

    case 'SET_DRAG_STATE':
      return { ...state, dragState: { ...state.dragState, ...action.payload } };

    case 'SET_COLUMN_DRAG_STATE':
      return { ...state, columnDragState: { ...state.columnDragState, ...action.payload } };

    // Workflow reducers
    case 'SET_WORKFLOW_PLANS': {
      const plans: Record<string, WorkflowPlan> = {};
      for (const plan of action.payload) {
        plans[plan.id] = plan;
      }
      return { ...state, workflowPlans: plans };
    }

    case 'UPDATE_WORKFLOW_PLAN':
      return {
        ...state,
        workflowPlans: {
          ...state.workflowPlans,
          [action.payload.id]: action.payload,
        },
      };

    case 'REMOVE_WORKFLOW_PLAN': {
      const { [action.payload]: _, ...remainingPlans } = state.workflowPlans;
      const { [action.payload]: __, ...remainingLogs } = state.workflowLogs;
      return {
        ...state,
        workflowPlans: remainingPlans,
        workflowLogs: remainingLogs,
      };
    }

    case 'ADD_WORKFLOW_LOG': {
      const log = action.payload;
      return {
        ...state,
        workflowLogs: {
          ...state.workflowLogs,
          [log.planId]: [...(state.workflowLogs[log.planId] || []), log],
        },
      };
    }

    case 'SET_WORKFLOW_LOGS':
      return {
        ...state,
        workflowLogs: {
          ...state.workflowLogs,
          [action.payload.planId]: action.payload.logs,
        },
      };

    case 'CLEAR_WORKFLOW_STATE':
      return { ...state, workflowPlans: {}, workflowLogs: {} };

    default:
      return state;
  }
}
