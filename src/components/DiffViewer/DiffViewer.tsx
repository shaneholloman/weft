import { useState, useRef, useCallback } from 'react';
import type { DiffFile, DiffHunk, DiffLine } from '../../utils/diffParser';
import type { DiffComment } from '../../types';
import './DiffViewer.css';

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
}

export function DiffViewer({
  files,
  selectedFile,
  onFileSelect,
  comments = [],
  onAddComment,
  onRemoveComment,
}: DiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(files.map((f) => f.path))
  );
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const dragStartRef = useRef<{ filePath: string; line: number; type: string } | null>(null);

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
    if (!selection || !commentText.trim() || !onAddComment) return;

    onAddComment({
      filePath: selection.filePath,
      lineNumber: selection.startLine,
      endLine: selection.endLine,
      lineType: selection.startType,
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
                    selection={selection}
                    showCommentInput={showInputForFile}
                    commentText={commentText}
                    onCommentTextChange={setCommentText}
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
  selection: LineSelection | null;
  showCommentInput: boolean;
  commentText: string;
  onCommentTextChange: (text: string) => void;
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
  selection,
  showCommentInput,
  commentText,
  onCommentTextChange,
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
              showCommentInput={showInputAfterThisLine}
              commentText={commentText}
              onCommentTextChange={onCommentTextChange}
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
  showCommentInput: boolean;
  commentText: string;
  onCommentTextChange: (text: string) => void;
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
  showCommentInput,
  commentText,
  onCommentTextChange,
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
          <textarea
            className="diff-comment-textarea"
            value={commentText}
            onChange={(e) => onCommentTextChange(e.target.value)}
            placeholder="Add your feedback on the selected lines..."
            rows={2}
            autoFocus
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div className="diff-comment-actions">
            <button className="diff-comment-cancel" onClick={onCancelComment}>
              Cancel
            </button>
            <button
              className="diff-comment-submit"
              onClick={onAddComment}
              disabled={!commentText.trim()}
            >
              Add Comment
            </button>
          </div>
        </div>
      )}

      {/* Existing comments that end on this line */}
      {comments.map((comment) => (
        <div key={comment.id} className="diff-comment">
          {comment.endLine && comment.endLine !== comment.lineNumber && (
            <span className="diff-comment-lines">
              Lines {comment.lineNumber}-{comment.endLine}
            </span>
          )}
          <span className="diff-comment-content">{comment.content}</span>
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
}

export function FileTree({ files, selectedFile, onSelect }: FileTreeProps) {
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
