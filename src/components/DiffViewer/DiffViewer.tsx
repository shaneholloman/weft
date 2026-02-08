import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { DiffFile, DiffHunk, DiffLine } from '../../utils/diffParser';
import type { DiffComment } from '../../types';
import './DiffViewer.css';

/**
 * Lightweight markdown renderer for diff comments.
 * Supports: fenced code blocks, inline code, bold, italic.
 */
function SimpleMarkdown({ text }: { text: string }) {
  const rendered = useMemo(() => {
    const parts: React.ReactNode[] = [];
    // Split on fenced code blocks first
    const codeBlockRe = /```(?:\w*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = codeBlockRe.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(...renderInline(text.slice(lastIndex, match.index), key));
        key += 100;
      }
      parts.push(
        <pre key={`cb-${key++}`} className="diff-comment-codeblock"><code>{match[1].replace(/\n$/, '')}</code></pre>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(...renderInline(text.slice(lastIndex), key));
    }
    return parts;
  }, [text]);

  return <>{rendered}</>;
}

function renderInline(text: string, keyStart: number): React.ReactNode[] {
  // Process inline: **bold**, *italic*, `code`
  const inlineRe = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = keyStart;

  while ((match = inlineRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${key++}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[2]) {
      parts.push(<strong key={`b-${key++}`}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={`i-${key++}`}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={`c-${key++}`} className="diff-comment-inline-code">{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={`t-${key++}`}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

interface LineSelection {
  filePath: string;
  startLine: number;
  endLine: number;
  startType: 'addition' | 'deletion' | 'context';
  endType: 'addition' | 'deletion' | 'context';
}

interface DiffViewerProps {
  files: DiffFile[];
  selectedFile?: string;
  onFileSelect?: (path: string) => void;
  comments?: DiffComment[];
  onAddComment?: (comment: Omit<DiffComment, 'id'>) => void;
  onRemoveComment?: (id: string) => void;
  activeCommentId?: string | null;
  commentMode?: 'comment-only' | 'comment-and-suggestion';
}

export function DiffViewer({
  files,
  selectedFile,
  onFileSelect,
  comments = [],
  onAddComment,
  onRemoveComment,
  activeCommentId = null,
  commentMode = 'comment-only',
}: DiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(files.map((f) => f.path))
  );
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentKind, setCommentKind] = useState<'comment' | 'suggestion'>('comment');
  const [suggestionText, setSuggestionText] = useState('');
  const dragStartRef = useRef<{ filePath: string; line: number; type: string } | null>(null);

  const resetCommentForm = useCallback(() => {
    setSelection(null);
    setShowCommentInput(false);
    setCommentText('');
    setCommentKind('comment');
    setSuggestionText('');
  }, []);

  const handleLineMouseDown = useCallback((filePath: string, lineNumber: number, lineType: string, e: React.MouseEvent) => {
    if (lineType === 'context' || lineType === 'header') return;

    // Start tracking for potential drag
    dragStartRef.current = { filePath, line: lineNumber, type: lineType };
    setIsDragging(true);
    setSelection({
      filePath,
      startLine: lineNumber,
      endLine: lineNumber,
      startType: lineType as 'addition' | 'deletion' | 'context',
      endType: lineType as 'addition' | 'deletion' | 'context',
    });
    setShowCommentInput(false);
    setCommentKind('comment');
    setSuggestionText('');

    // Prevent text selection during drag
    e.preventDefault();
  }, []);

  const handleLineMouseEnter = useCallback((filePath: string, lineNumber: number, lineType: string) => {
    if (!isDragging || !dragStartRef.current) return;
    if (filePath !== dragStartRef.current.filePath) return;

    const start = dragStartRef.current.line;
    const isEndLine = lineNumber >= start;
    setSelection({
      filePath,
      startLine: Math.min(start, lineNumber),
      endLine: Math.max(start, lineNumber),
      startType: isEndLine ? dragStartRef.current.type as 'addition' | 'deletion' | 'context' : lineType as 'addition' | 'deletion' | 'context',
      endType: isEndLine ? lineType as 'addition' | 'deletion' | 'context' : dragStartRef.current.type as 'addition' | 'deletion' | 'context',
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
    if (!selection || !onAddComment) return;

    const body = commentText.trim();
    const suggestion = suggestionText.trimEnd();
    const requiresSuggestion = commentMode === 'comment-and-suggestion' && commentKind === 'suggestion';

    if (!body && !suggestion) return;
    if (requiresSuggestion && !suggestion) return;

    onAddComment({
      filePath: selection.filePath,
      lineNumber: selection.startLine,
      endLine: selection.endLine,
      lineType: selection.startType,
      content: body,
      kind: commentKind,
      suggestion: requiresSuggestion ? suggestion : undefined,
    });

    resetCommentForm();
  };

  const handleCancelComment = () => {
    resetCommentForm();
  };

  const isLineSelected = (filePath: string, lineNumber: number) => {
    if (!selection || selection.filePath !== filePath) return false;
    return lineNumber >= selection.startLine && lineNumber <= selection.endLine;
  };

  // Check if a line has a comment (includes range check and type check)
  const hasComment = useCallback((filePath: string, lineNumber: number, lineType: string) => {
    return comments.some((c) => {
      if (c.filePath !== filePath) return false;
      if (c.lineType !== lineType) return false;
      const start = c.lineNumber;
      const end = c.endLine ?? c.lineNumber;
      return lineNumber >= start && lineNumber <= end;
    });
  }, [comments]);

  const toggleFile = (path: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFiles(newExpanded);
  };

  // Ensure externally selected files are visible even if user previously collapsed them.
  useEffect(() => {
    if (!selectedFile) return;
    setExpandedFiles((prev) => {
      if (prev.has(selectedFile)) return prev;
      const next = new Set(prev);
      next.add(selectedFile);
      return next;
    });
  }, [selectedFile]);

  if (files.length === 0) {
    return (
      <div className="diff-viewer-empty">
        No changes to display
      </div>
    );
  }

  const canComment = !!onAddComment;

  return (
    <div
      className="diff-viewer"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {files.map((file) => {
        const fileComments = comments.filter((c) => c.filePath === file.path);
        const showInputForFile = showCommentInput && selection?.filePath === file.path;

        return (
          <div
            key={file.path}
            data-file-path={file.path}
            className={`diff-file ${selectedFile === file.path ? 'selected' : ''}`}
          >
            <div
              className="diff-file-header"
              onClick={() => {
                toggleFile(file.path);
                onFileSelect?.(file.path);
              }}
            >
              <span className="diff-file-toggle">
                {expandedFiles.has(file.path) ? '▼' : '▶'}
              </span>
              <span className={`diff-file-icon ${file.action}`}>
                {file.action === 'added' && '+'}
                {file.action === 'deleted' && '-'}
                {file.action === 'modified' && '~'}
                {file.action === 'renamed' && '>'}
              </span>
              <span className="diff-file-path">
                {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
              </span>
              <span className="diff-file-stats">
                {file.additions > 0 && (
                  <span className="stat-additions">+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span className="stat-deletions">-{file.deletions}</span>
                )}
              </span>
            </div>

            {expandedFiles.has(file.path) && (
              <div className="diff-file-content">
                {file.hunks.map((hunk, hunkIndex) => (
                  <DiffHunkView
                    key={hunkIndex}
                    hunk={hunk}
                    filePath={file.path}
                    comments={fileComments}
                    activeCommentId={activeCommentId}
                    selection={selection}
                    showCommentInput={showInputForFile}
                    commentText={commentText}
                    commentKind={commentKind}
                    suggestionText={suggestionText}
                    commentMode={commentMode}
                    onCommentTextChange={setCommentText}
                    onCommentKindChange={setCommentKind}
                    onSuggestionTextChange={setSuggestionText}
                    onAddComment={handleAddComment}
                    onCancelComment={handleCancelComment}
                    onRemoveComment={onRemoveComment}
                    onLineMouseDown={canComment ? handleLineMouseDown : undefined}
                    onLineMouseEnter={canComment ? handleLineMouseEnter : undefined}
                    isLineSelected={isLineSelected}
                    hasComment={hasComment}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DiffHunkViewProps {
  hunk: DiffHunk;
  filePath: string;
  comments: DiffComment[];
  activeCommentId?: string | null;
  selection: LineSelection | null;
  showCommentInput: boolean;
  commentText: string;
  commentKind: 'comment' | 'suggestion';
  suggestionText: string;
  commentMode: 'comment-only' | 'comment-and-suggestion';
  onCommentTextChange: (text: string) => void;
  onCommentKindChange: (kind: 'comment' | 'suggestion') => void;
  onSuggestionTextChange: (text: string) => void;
  onAddComment: () => void;
  onCancelComment: () => void;
  onRemoveComment?: (id: string) => void;
  onLineMouseDown?: (filePath: string, lineNumber: number, lineType: string, e: React.MouseEvent) => void;
  onLineMouseEnter?: (filePath: string, lineNumber: number, lineType: string) => void;
  isLineSelected: (filePath: string, lineNumber: number) => boolean;
  hasComment: (filePath: string, lineNumber: number, lineType: string) => boolean;
}

function DiffHunkView({
  hunk,
  filePath,
  comments,
  activeCommentId,
  selection,
  showCommentInput,
  commentText,
  commentKind,
  suggestionText,
  commentMode,
  onCommentTextChange,
  onCommentKindChange,
  onSuggestionTextChange,
  onAddComment,
  onCancelComment,
  onRemoveComment,
  onLineMouseDown,
  onLineMouseEnter,
  isLineSelected,
  hasComment,
}: DiffHunkViewProps) {
  // Find where to show the comment input (after the last selected line)
  const selectionEndLine = selection?.filePath === filePath ? selection.endLine : null;
  const selectionEndType = selection?.filePath === filePath ? selection.endType : null;

  // Group comments by their end line AND type for display
  // Key format: "lineNumber:lineType" to handle same line numbers with different types
  const commentsByLineAndType = comments.reduce((acc, c) => {
    const key = `${c.endLine ?? c.lineNumber}:${c.lineType}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {} as Record<string, DiffComment[]>);

  return (
    <div className="diff-hunk">
      <div className="diff-hunk-header">{hunk.header}</div>
      <div className="diff-hunk-lines">
        {hunk.lines.map((line, lineIndex) => {
          const lineNumber = line.newLineNumber ?? line.oldLineNumber ?? 0;
          const isSelected = isLineSelected(filePath, lineNumber);
          // Get comments matching both line number AND type
          const lineComments = commentsByLineAndType[`${lineNumber}:${line.type}`] || [];
          // Only show input after the specific line that matches both number AND type
          const showInputAfterThisLine = showCommentInput && selectionEndLine === lineNumber && selectionEndType === line.type;

          return (
            <DiffLineView
              key={lineIndex}
              line={line}
              filePath={filePath}
              lineNumber={lineNumber}
              isSelected={isSelected}
              hasComment={hasComment(filePath, lineNumber, line.type)}
              comments={lineComments}
              activeCommentId={activeCommentId}
              showCommentInput={showInputAfterThisLine}
              commentText={commentText}
              commentKind={commentKind}
              suggestionText={suggestionText}
              commentMode={commentMode}
              onCommentTextChange={onCommentTextChange}
              onCommentKindChange={onCommentKindChange}
              onSuggestionTextChange={onSuggestionTextChange}
              onAddComment={onAddComment}
              onCancelComment={onCancelComment}
              onRemoveComment={onRemoveComment}
              onMouseDown={onLineMouseDown}
              onMouseEnter={onLineMouseEnter}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DiffLineViewProps {
  line: DiffLine;
  filePath: string;
  lineNumber: number;
  isSelected: boolean;
  hasComment: boolean;
  comments: DiffComment[];
  activeCommentId?: string | null;
  showCommentInput: boolean;
  commentText: string;
  commentKind: 'comment' | 'suggestion';
  suggestionText: string;
  commentMode: 'comment-only' | 'comment-and-suggestion';
  onCommentTextChange: (text: string) => void;
  onCommentKindChange: (kind: 'comment' | 'suggestion') => void;
  onSuggestionTextChange: (text: string) => void;
  onAddComment: () => void;
  onCancelComment: () => void;
  onRemoveComment?: (id: string) => void;
  onMouseDown?: (filePath: string, lineNumber: number, lineType: string, e: React.MouseEvent) => void;
  onMouseEnter?: (filePath: string, lineNumber: number, lineType: string) => void;
}

function DiffLineView({
  line,
  filePath,
  lineNumber,
  isSelected,
  hasComment,
  comments,
  activeCommentId,
  showCommentInput,
  commentText,
  commentKind,
  suggestionText,
  commentMode,
  onCommentTextChange,
  onCommentKindChange,
  onSuggestionTextChange,
  onAddComment,
  onCancelComment,
  onRemoveComment,
  onMouseDown,
  onMouseEnter,
}: DiffLineViewProps) {
  const getLineClass = () => {
    switch (line.type) {
      case 'addition':
        return 'line-addition';
      case 'deletion':
        return 'line-deletion';
      case 'context':
        return 'line-context';
      default:
        return '';
    }
  };

  const getLinePrefix = () => {
    switch (line.type) {
      case 'addition':
        return '+';
      case 'deletion':
        return '-';
      case 'context':
        return ' ';
      default:
        return '';
    }
  };

  const canSelect = line.type === 'addition' || line.type === 'deletion';

  return (
    <>
      <div
        className={`diff-line ${getLineClass()} ${isSelected ? 'selected' : ''} ${canSelect && onMouseDown ? 'selectable' : ''}`}
        data-line-file={filePath}
        data-line-number={lineNumber}
        data-line-type={line.type}
        onMouseDown={canSelect && onMouseDown ? (e) => onMouseDown(filePath, lineNumber, line.type, e) : undefined}
        onMouseEnter={onMouseEnter ? () => onMouseEnter(filePath, lineNumber, line.type) : undefined}
      >
        <span className="diff-line-number old">
          {line.oldLineNumber ?? ''}
        </span>
        <span className="diff-line-number new">
          {line.newLineNumber ?? ''}
        </span>
        <span className="diff-line-prefix">{getLinePrefix()}</span>
        <span className="diff-line-content">
          <code>{line.content || '\n'}</code>
        </span>
        {/* Comment indicator column - shows + on hover for commentable lines */}
        {canSelect && onMouseDown && (
          <span className={`diff-line-comment-indicator ${hasComment ? 'has-comment' : ''}`}>
            +
          </span>
        )}
      </div>

      {/* Comment input - appears after selection end */}
      {showCommentInput && (
        <div className="diff-comment-input">
          {commentMode === 'comment-and-suggestion' && (
            <div className="diff-comment-type">
              <label htmlFor={`diff-comment-kind-${filePath}-${lineNumber}`}>Type</label>
              <select
                id={`diff-comment-kind-${filePath}-${lineNumber}`}
                value={commentKind}
                onChange={(e) => onCommentKindChange(e.target.value as 'comment' | 'suggestion')}
              >
                <option value="comment">Comment</option>
                <option value="suggestion">Suggestion</option>
              </select>
            </div>
          )}
          <textarea
            className="diff-comment-textarea"
            value={commentText}
            onChange={(e) => onCommentTextChange(e.target.value)}
            placeholder={commentKind === 'suggestion'
              ? 'Optional context for this suggestion...'
              : commentMode === 'comment-and-suggestion'
                ? 'Add a comment for the PR author on the selected lines...'
                : 'Add your feedback on the selected lines...'}
            rows={2}
            autoFocus
            onMouseDown={(e) => e.stopPropagation()}
          />
          {commentMode === 'comment-and-suggestion' && commentKind === 'suggestion' && (
            <textarea
              className="diff-comment-textarea diff-comment-suggestion"
              value={suggestionText}
              onChange={(e) => onSuggestionTextChange(e.target.value)}
              placeholder="Suggested replacement code/text..."
              rows={3}
              onMouseDown={(e) => e.stopPropagation()}
            />
          )}
          <div className="diff-comment-actions">
            <button className="diff-comment-cancel" onClick={onCancelComment}>
              Cancel
            </button>
            <button
              className="diff-comment-submit"
              onClick={onAddComment}
              disabled={
                commentKind === 'suggestion'
                  ? !suggestionText.trim()
                  : !commentText.trim()
              }
            >
              {commentKind === 'suggestion' ? 'Add Suggestion' : 'Add Comment'}
            </button>
          </div>
        </div>
      )}

      {/* Existing comments that end on this line */}
      {comments.map((comment) => (
        <div
          key={comment.id}
          className={`diff-comment ${activeCommentId === comment.id ? 'active' : ''}`}
          data-comment-id={comment.id}
          data-comment-file={comment.filePath}
          data-comment-line={comment.lineNumber}
        >
          <div className="diff-comment-meta">
            <span className="diff-comment-badge">
              {comment.kind === 'suggestion' ? 'suggestion' : 'comment'}
            </span>
            {comment.endLine && comment.endLine !== comment.lineNumber && (
              <span className="diff-comment-lines">
                L{comment.lineNumber}–{comment.endLine}
              </span>
            )}
          </div>
          <span className="diff-comment-content"><SimpleMarkdown text={comment.content} /></span>
          {comment.kind === 'suggestion' && comment.suggestion && (
            <div className="diff-comment-suggestion-preview">
              {comment.suggestion}
            </div>
          )}
          {onRemoveComment && (
            <button
              className="diff-comment-remove"
              onClick={() => onRemoveComment(comment.id)}
              title="Remove comment"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * File tree component for navigating changed files
 */
interface FileTreeProps {
  files: DiffFile[];
  selectedFile?: string;
  onSelect: (path: string) => void;
  noteCounts?: Record<string, number>;
}

export function FileTree({ files, selectedFile, onSelect, noteCounts }: FileTreeProps) {
  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Changed Files</span>
        <span className="file-tree-count">{files.length}</span>
      </div>
      <div className="file-tree-list">
        {files.map((file) => (
          <button
            key={file.path}
            className={`file-tree-item ${selectedFile === file.path ? 'selected' : ''}`}
            onClick={() => onSelect(file.path)}
          >
            <span className={`file-tree-icon ${file.action}`}>
              {file.action === 'added' && '+'}
              {file.action === 'deleted' && '-'}
              {file.action === 'modified' && '~'}
              {file.action === 'renamed' && '>'}
            </span>
            <span className="file-tree-name">
              {file.path.split('/').pop()}
            </span>
            <span className="file-tree-stats">
              {typeof noteCounts?.[file.path] === 'number' && noteCounts[file.path] > 0 && (
                <span className="file-tree-note-count">{noteCounts[file.path]}</span>
              )}
              {file.additions > 0 && (
                <span className="stat-additions">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="stat-deletions">-{file.deletions}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
