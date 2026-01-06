/**
 * Shared hook for approval comment management
 *
 * Extracts common comment handling logic used across approval components:
 * - DefaultApproval
 * - GoogleSheetsApproval
 * - GoogleDocsApproval
 * - EmailApproval
 */

import { useState, useCallback, useRef } from 'react';

// ============================================
// TYPES
// ============================================

export interface TitleEditState {
  editedTitle: string | null;
  titleComment: string | null;
  showTitleCommentInput: boolean;
  titleCommentText: string;
}

export interface DragState<T> {
  selection: T | null;
  isDragging: boolean;
  dragStartRef: React.RefObject<{ index: number; side: 'left' | 'right' } | null>;
}

export interface CommentInputState {
  showCommentInput: boolean;
  commentText: string;
}

// ============================================
// TITLE EDITING HOOK
// ============================================

export interface UseTitleEditOptions {
  initialTitle?: string;
}

export interface UseTitleEditResult {
  editedTitle: string | null;
  setEditedTitle: (title: string | null) => void;
  titleComment: string | null;
  showTitleCommentInput: boolean;
  titleCommentText: string;
  handleStartTitleComment: () => void;
  handleEditTitleComment: () => void;
  handleAddTitleComment: () => void;
  handleCancelTitleComment: () => void;
  handleRemoveTitleComment: () => void;
  setTitleCommentText: (text: string) => void;
  hasTitleComment: boolean;
}

export function useTitleEdit(options: UseTitleEditOptions = {}): UseTitleEditResult {
  const [editedTitle, setEditedTitle] = useState<string | null>(options.initialTitle ?? null);
  const [titleComment, setTitleComment] = useState<string | null>(null);
  const [showTitleCommentInput, setShowTitleCommentInput] = useState(false);
  const [titleCommentText, setTitleCommentText] = useState('');

  const handleStartTitleComment = useCallback(() => {
    setShowTitleCommentInput(true);
    setTitleCommentText('');
  }, []);

  const handleEditTitleComment = useCallback(() => {
    if (titleComment) {
      setTitleCommentText(titleComment);
      setShowTitleCommentInput(true);
    }
  }, [titleComment]);

  const handleAddTitleComment = useCallback(() => {
    if (titleCommentText.trim()) {
      setTitleComment(titleCommentText.trim());
      setShowTitleCommentInput(false);
      setTitleCommentText('');
    }
  }, [titleCommentText]);

  const handleCancelTitleComment = useCallback(() => {
    setShowTitleCommentInput(false);
    setTitleCommentText('');
  }, []);

  const handleRemoveTitleComment = useCallback(() => {
    setTitleComment(null);
  }, []);

  return {
    editedTitle,
    setEditedTitle,
    titleComment,
    showTitleCommentInput,
    titleCommentText,
    handleStartTitleComment,
    handleEditTitleComment,
    handleAddTitleComment,
    handleCancelTitleComment,
    handleRemoveTitleComment,
    setTitleCommentText,
    hasTitleComment: titleComment !== null,
  };
}

// ============================================
// ROW/LINE SELECTION HOOK (for diff views)
// ============================================

export interface SelectionRange {
  startIndex: number;
  endIndex: number;
  side: 'left' | 'right';
}

export interface UseRowSelectionResult {
  selection: SelectionRange | null;
  isDragging: boolean;
  dragStartRef: React.RefObject<{ index: number; side: 'left' | 'right' } | null>;
  handleMouseDown: (index: number, side: 'left' | 'right') => void;
  handleMouseMove: (index: number, side: 'left' | 'right') => void;
  handleMouseUp: () => void;
  clearSelection: () => void;
}

export function useRowSelection(): UseRowSelectionResult {
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ index: number; side: 'left' | 'right' } | null>(null);

  const handleMouseDown = useCallback((index: number, side: 'left' | 'right') => {
    dragStartRef.current = { index, side };
    setIsDragging(true);
    setSelection({ startIndex: index, endIndex: index, side });
  }, []);

  const handleMouseMove = useCallback((index: number, side: 'left' | 'right') => {
    if (!isDragging || !dragStartRef.current) return;
    if (side !== dragStartRef.current.side) return;

    const start = Math.min(dragStartRef.current.index, index);
    const end = Math.max(dragStartRef.current.index, index);
    setSelection({ startIndex: start, endIndex: end, side });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    dragStartRef.current = null;
  }, []);

  return {
    selection,
    isDragging,
    dragStartRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    clearSelection,
  };
}

// ============================================
// COMMENT INPUT HOOK
// ============================================

export interface UseCommentInputResult {
  showCommentInput: boolean;
  commentText: string;
  setCommentText: (text: string) => void;
  openCommentInput: () => void;
  closeCommentInput: () => void;
  submitComment: (onSubmit: (text: string) => void) => void;
}

export function useCommentInput(): UseCommentInputResult {
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');

  const openCommentInput = useCallback(() => {
    setShowCommentInput(true);
    setCommentText('');
  }, []);

  const closeCommentInput = useCallback(() => {
    setShowCommentInput(false);
    setCommentText('');
  }, []);

  const submitComment = useCallback((onSubmit: (text: string) => void) => {
    if (commentText.trim()) {
      onSubmit(commentText.trim());
      setShowCommentInput(false);
      setCommentText('');
    }
  }, [commentText]);

  return {
    showCommentInput,
    commentText,
    setCommentText,
    openCommentInput,
    closeCommentInput,
    submitComment,
  };
}

// ============================================
// GENERIC COMMENTS LIST HOOK
// ============================================

export interface CommentBase {
  id: string;
}

export interface UseCommentsResult<T extends CommentBase> {
  comments: T[];
  addComment: (comment: Omit<T, 'id'>) => void;
  removeComment: (id: string) => void;
  clearComments: () => void;
  commentCount: number;
}

export function useComments<T extends CommentBase>(): UseCommentsResult<T> {
  const [comments, setComments] = useState<T[]>([]);

  const addComment = useCallback((comment: Omit<T, 'id'>) => {
    const newComment = {
      ...comment,
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    } as T;
    setComments((prev) => [...prev, newComment]);
  }, []);

  const removeComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearComments = useCallback(() => {
    setComments([]);
  }, []);

  return {
    comments,
    addComment,
    removeComment,
    clearComments,
    commentCount: comments.length,
  };
}

// ============================================
// FIELD COMMENTS HOOK (for key-value approvals)
// ============================================

export interface FieldComment {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  content: string;
}

export interface UseFieldCommentsResult {
  fieldComments: FieldComment[];
  commentingField: string | null;
  commentInput: string;
  setCommentInput: (text: string) => void;
  startFieldComment: (fieldKey: string) => void;
  editFieldComment: (fieldKey: string, currentContent: string) => void;
  submitFieldComment: (fieldKey: string, fieldLabel: string) => void;
  cancelFieldComment: () => void;
  removeFieldComment: (fieldKey: string) => void;
  getFieldComment: (fieldKey: string) => FieldComment | undefined;
  hasFieldComment: (fieldKey: string) => boolean;
  commentCount: number;
}

export function useFieldComments(): UseFieldCommentsResult {
  const [fieldComments, setFieldComments] = useState<FieldComment[]>([]);
  const [commentingField, setCommentingField] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');

  const startFieldComment = useCallback((fieldKey: string) => {
    setCommentingField(fieldKey);
    setCommentInput('');
  }, []);

  const editFieldComment = useCallback((fieldKey: string, currentContent: string) => {
    setCommentInput(currentContent);
    setCommentingField(fieldKey);
  }, []);

  const submitFieldComment = useCallback((fieldKey: string, fieldLabel: string) => {
    if (!commentInput.trim()) return;

    setFieldComments((prev) => {
      const existingIndex = prev.findIndex((c) => c.fieldKey === fieldKey);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          content: commentInput.trim(),
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          fieldKey,
          fieldLabel,
          content: commentInput.trim(),
        },
      ];
    });

    setCommentingField(null);
    setCommentInput('');
  }, [commentInput]);

  const cancelFieldComment = useCallback(() => {
    setCommentingField(null);
    setCommentInput('');
  }, []);

  const removeFieldComment = useCallback((fieldKey: string) => {
    setFieldComments((prev) => prev.filter((c) => c.fieldKey !== fieldKey));
  }, []);

  const getFieldComment = useCallback(
    (fieldKey: string) => fieldComments.find((c) => c.fieldKey === fieldKey),
    [fieldComments]
  );

  const hasFieldComment = useCallback(
    (fieldKey: string) => fieldComments.some((c) => c.fieldKey === fieldKey),
    [fieldComments]
  );

  return {
    fieldComments,
    commentingField,
    commentInput,
    setCommentInput,
    startFieldComment,
    editFieldComment,
    submitFieldComment,
    cancelFieldComment,
    removeFieldComment,
    getFieldComment,
    hasFieldComment,
    commentCount: fieldComments.length,
  };
}

// ============================================
// UTILITY: Generate unique ID
// ============================================

export function generateCommentId(): string {
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
