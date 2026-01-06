/**
 * CommentableText - Line-selectable text with inline comments
 *
 * Used for adding line-level comments to text content like
 * email bodies, PR descriptions, or any text being reviewed.
 * Similar interaction pattern to DiffViewer.
 */

import { useState, useRef, useCallback } from 'react';
import type { TextComment } from '../../types';
import './CommentableText.css';

export type { TextComment };

interface LineSelection {
  startLine: number;
  endLine: number;
}

interface CommentableTextProps {
  content: string;
  label?: string;
  comments: TextComment[];
  onAddComment: (comment: Omit<TextComment, 'id'>) => void;
  onRemoveComment: (id: string) => void;
  disabled?: boolean;
  /**
   * Display variant:
   * - 'code': Line numbers, monospace-ish layout (default)
   * - 'prose': No line numbers, document-like layout for emails/docs
   */
  variant?: 'code' | 'prose';
}

export function CommentableText({
  content,
  label,
  comments,
  onAddComment,
  onRemoveComment,
  disabled = false,
  variant = 'code',
}: CommentableTextProps) {
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const dragStartRef = useRef<number | null>(null);

  // Split content into lines or paragraphs based on variant
  // Prose mode splits by paragraph (double newline), code mode by line
  const lines = variant === 'prose'
    ? content.split(/\n\n+/).filter(p => p.trim())
    : content.split('\n');

  const handleLineMouseDown = useCallback((lineNumber: number, e: React.MouseEvent) => {
    if (disabled) return;

    dragStartRef.current = lineNumber;
    setIsDragging(true);
    setSelection({
      startLine: lineNumber,
      endLine: lineNumber,
    });
    setShowCommentInput(false);

    // Prevent text selection during drag
    e.preventDefault();
  }, [disabled]);

  const handleLineMouseEnter = useCallback((lineNumber: number) => {
    if (!isDragging || dragStartRef.current === null) return;

    const start = dragStartRef.current;
    setSelection({
      startLine: Math.min(start, lineNumber),
      endLine: Math.max(start, lineNumber),
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && selection) {
      setShowCommentInput(true);
    }
    setIsDragging(false);
    dragStartRef.current = null;
  }, [isDragging, selection]);

  const handleAddComment = () => {
    if (!selection || !commentText.trim()) return;

    onAddComment({
      lineStart: selection.startLine,
      lineEnd: selection.endLine,
      content: commentText.trim(),
    });

    setSelection(null);
    setShowCommentInput(false);
    setCommentText('');
  };

  const handleCancelComment = () => {
    setSelection(null);
    setShowCommentInput(false);
    setCommentText('');
  };

  const isLineSelected = (lineNumber: number) => {
    if (!selection) return false;
    return lineNumber >= selection.startLine && lineNumber <= selection.endLine;
  };

  // Check if a line has a comment (includes range check)
  const hasComment = useCallback((lineNumber: number) => {
    return comments.some((c) => {
      return lineNumber >= c.lineStart && lineNumber <= c.lineEnd;
    });
  }, [comments]);

  // Get comments that end on a specific line
  const getCommentsEndingAt = (lineNumber: number) => {
    return comments.filter((c) => c.lineEnd === lineNumber);
  };

  return (
    <div
      className={`commentable-text commentable-text-${variant}`}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {label && <label className="commentable-text-label">{label}</label>}
      <div className="commentable-text-content">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const isSelected = isLineSelected(lineNumber);
          const lineHasComment = hasComment(lineNumber);
          const lineComments = getCommentsEndingAt(lineNumber);
          const showInputAfterLine = showCommentInput && selection?.endLine === lineNumber;

          return (
            <div key={index} className="commentable-text-line-wrapper">
              <div
                className={`commentable-text-line ${isSelected ? 'selected' : ''} ${disabled ? '' : 'selectable'}`}
                onMouseDown={disabled ? undefined : (e) => handleLineMouseDown(lineNumber, e)}
                onMouseEnter={disabled ? undefined : () => handleLineMouseEnter(lineNumber)}
              >
                {variant === 'code' && (
                  <span className="commentable-text-line-number">{lineNumber}</span>
                )}
                <span className="commentable-text-line-content">
                  {line || '\u00A0'}
                </span>
                <span className={`commentable-text-comment-indicator ${lineHasComment ? 'has-comment' : ''} ${!disabled ? 'can-comment' : ''}`}>
                  +
                </span>
              </div>

              {/* Comment input - appears after selection end */}
              {showInputAfterLine && (
                <div className="commentable-text-comment-input">
                  <textarea
                    className="commentable-text-comment-textarea"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={variant === 'prose'
                      ? 'Add your feedback on this section...'
                      : 'Add your feedback on the selected lines...'}
                    rows={2}
                    autoFocus
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <div className="commentable-text-comment-actions">
                    <button className="commentable-text-comment-cancel" onClick={handleCancelComment}>
                      Cancel
                    </button>
                    <button
                      className="commentable-text-comment-submit"
                      onClick={handleAddComment}
                      disabled={!commentText.trim()}
                    >
                      Add Comment
                    </button>
                  </div>
                </div>
              )}

              {/* Existing comments that end on this line */}
              {lineComments.map((comment) => (
                <div key={comment.id} className="commentable-text-comment">
                  {comment.lineEnd !== comment.lineStart && (
                    <span className="commentable-text-comment-lines">
                      {variant === 'prose'
                        ? `Paragraphs ${comment.lineStart}-${comment.lineEnd}`
                        : `Lines ${comment.lineStart}-${comment.lineEnd}`}
                    </span>
                  )}
                  <span className="commentable-text-comment-content">{comment.content}</span>
                  <button
                    className="commentable-text-comment-remove"
                    onClick={() => onRemoveComment(comment.id)}
                    title="Remove comment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Format text comments into a feedback string
 */
export function formatTextComments(comments: TextComment[]): string {
  if (comments.length === 0) return '';

  const lines: string[] = [];

  for (const c of comments) {
    const lineRef = c.lineEnd !== c.lineStart
      ? `Lines ${c.lineStart}-${c.lineEnd}`
      : `Line ${c.lineStart}`;
    lines.push(`${lineRef}: "${c.content}"`);
  }

  return lines.join('\n');
}
