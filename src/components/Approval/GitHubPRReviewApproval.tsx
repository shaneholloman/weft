/**
 * GitHub PR Review Approval View
 *
 * Review-focused approval UI for posting PR reviews:
 * - Shows PR metadata and author
 * - Displays full diff with inline notes
 * - Supports review decision, summary, comments, and suggestions
 * - Supports "Revise Review" loop with revision notes
 */

import { useMemo, useRef, useState } from 'react';
import { McpIcon } from '../common';
import { ApprovalFooter } from './ApprovalFooter';
import { DiffViewer, FileTree } from '../DiffViewer/DiffViewer';
import { parseDiff } from '../../utils/diffParser';
import type { ApprovalViewProps } from './ApprovalViewRegistry';
import type { DiffComment } from '../../types';
import './GitHubPRReviewApproval.css';

type ReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
type ReviewCommentSide = 'LEFT' | 'RIGHT';

interface ReviewCommentDraft {
  path: string;
  line: number;
  side: ReviewCommentSide;
  body?: string;
  startLine?: number;
  startSide?: ReviewCommentSide;
  suggestion?: string;
}

interface PRReviewApprovalData {
  owner?: string;
  repo?: string;
  pullNumber?: number;
  prTitle?: string;
  title?: string;
  author?: string;
  authorLogin?: string;
  baseBranch?: string;
  headBranch?: string;
  base?: string;
  head?: string;
  diff?: string;
  stats?: {
    files?: number;
    additions?: number;
    deletions?: number;
  };
  event?: ReviewDecision;
  body?: string;
  comments?: ReviewCommentDraft[];
}

function serializeComments(comments: DiffComment[]): string {
  const normalized = comments.map((comment) => ({
    filePath: comment.filePath,
    lineNumber: comment.lineNumber,
    endLine: comment.endLine ?? null,
    lineType: comment.lineType,
    content: comment.content.trim(),
    kind: comment.kind || 'comment',
    suggestion: (comment.suggestion || '').trimEnd(),
  }));
  return JSON.stringify(normalized);
}

/** Strip wrapping code fences the agent may add — our backend already wraps in ```suggestion. */
function stripCodeFences(text: string): string {
  return text.replace(/^```\w*\n?/, '').replace(/\n?```\s*$/, '');
}

function toDiffComment(comment: ReviewCommentDraft): DiffComment {
  const rawSuggestion = comment.suggestion?.trimEnd();
  const cleanSuggestion = rawSuggestion ? stripCodeFences(rawSuggestion) : undefined;
  const isSuggestion = !!cleanSuggestion;
  const lineType = comment.side === 'LEFT' ? 'deletion' : 'addition';
  const startLine = comment.startLine ?? comment.line;
  const endLine = comment.line;
  const fallbackContent = isSuggestion ? 'Suggested change' : 'Review note';

  return {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    filePath: comment.path,
    lineNumber: Math.min(startLine, endLine),
    endLine: startLine !== endLine ? Math.max(startLine, endLine) : undefined,
    lineType,
    content: comment.body?.trim() || fallbackContent,
    kind: isSuggestion ? 'suggestion' : 'comment',
    suggestion: cleanSuggestion,
  };
}

function toReviewComment(comment: DiffComment): ReviewCommentDraft | null {
  const side: ReviewCommentSide = comment.lineType === 'deletion' ? 'LEFT' : 'RIGHT';
  const startLine = comment.lineNumber;
  const endLine = comment.endLine ?? comment.lineNumber;
  const normalizedStartLine = Math.min(startLine, endLine);
  const normalizedEndLine = Math.max(startLine, endLine);
  const baseBody = comment.content.trim();
  const suggestion = comment.kind === 'suggestion' ? (comment.suggestion?.trimEnd() || '') : undefined;

  if (!baseBody && !suggestion) {
    return null;
  }

  // GitHub suggestions are only supported on RIGHT side comments.
  if (comment.kind === 'suggestion' && side === 'LEFT') {
    return {
      path: comment.filePath,
      line: normalizedEndLine,
      side,
      startLine: normalizedStartLine !== normalizedEndLine ? normalizedStartLine : undefined,
      startSide: normalizedStartLine !== normalizedEndLine ? side : undefined,
      body: [baseBody, suggestion].filter(Boolean).join('\n\n'),
    };
  }

  return {
    path: comment.filePath,
    line: normalizedEndLine,
    side,
    startLine: normalizedStartLine !== normalizedEndLine ? normalizedStartLine : undefined,
    startSide: normalizedStartLine !== normalizedEndLine ? side : undefined,
    body: baseBody,
    suggestion,
  };
}

function formatLineRef(comment: DiffComment): string {
  if (comment.endLine && comment.endLine !== comment.lineNumber) {
    return `L${comment.lineNumber}-${comment.endLine}`;
  }
  return `L${comment.lineNumber}`;
}

export function GitHubPRReviewApproval({
  action,
  data,
  onApprove,
  onRequestChanges,
  onCancel,
  isLoading,
}: ApprovalViewProps) {
  const diffViewerRef = useRef<HTMLDivElement>(null);

  let reviewData: PRReviewApprovalData = {};
  if (typeof data === 'string') {
    try {
      reviewData = JSON.parse(data);
    } catch {
      reviewData = {};
    }
  } else {
    reviewData = data as PRReviewApprovalData;
  }

  const {
    owner = '',
    repo = '',
    pullNumber,
    prTitle = reviewData.title || '',
    author = reviewData.authorLogin || reviewData.author || '',
    baseBranch,
    headBranch,
    base = 'main',
    head = '',
    diff = '',
    stats,
    event = 'COMMENT',
    body = '',
    comments: proposedComments = [],
  } = reviewData;

  const files = useMemo(() => parseDiff(diff), [diff]);

  const [selectedFile, setSelectedFile] = useState<string | undefined>(
    files.length > 0 ? files[0].path : undefined
  );
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>(event);
  const [reviewBody, setReviewBody] = useState(body);
  const [revisionNote, setRevisionNote] = useState('');
  const [showAgentFeedback, setShowAgentFeedback] = useState(false);
  const [activeInlineNoteId, setActiveInlineNoteId] = useState<string | null>(null);
  const [comments, setComments] = useState<DiffComment[]>(
    proposedComments.map(toDiffComment)
  );
  const initialCommentsSnapshot = useMemo(
    () => serializeComments(proposedComments.map(toDiffComment)),
    [proposedComments]
  );

  const totalFiles = stats?.files ?? files.length;
  const totalAdditions = stats?.additions ?? files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = stats?.deletions ?? files.reduce((sum, f) => sum + f.deletions, 0);
  const noteCountsByFile = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const comment of comments) {
      counts[comment.filePath] = (counts[comment.filePath] || 0) + 1;
    }
    return counts;
  }, [comments]);

  const hasRevisionNote = revisionNote.trim().length > 0;
  const commentsChanged = serializeComments(comments) !== initialCommentsSnapshot;

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    if (diffViewerRef.current) {
      const fileElement = diffViewerRef.current.querySelector(`[data-file-path="${CSS.escape(path)}"]`);
      if (fileElement) {
        fileElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleAddComment = (comment: Omit<DiffComment, 'id'>) => {
    const next: DiffComment = {
      ...comment,
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      kind: comment.kind || 'comment',
    };
    setComments((prev) => [...prev, next]);
    setActiveInlineNoteId(next.id);
  };

  const handleRemoveComment = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    setActiveInlineNoteId((prev) => (prev === id ? null : prev));
  };

  const handleApprove = () => {
    const reviewComments = comments
      .map(toReviewComment)
      .filter((comment): comment is ReviewCommentDraft => comment !== null);

    onApprove({
      owner,
      repo,
      pullNumber,
      event: reviewDecision,
      body: reviewBody.trim(),
      comments: reviewComments,
    });
  };

  const handleReviseOrExpand = () => {
    if (!showAgentFeedback) {
      setShowAgentFeedback(true);
      return;
    }
    handleReviseReview();
  };

  const handleReviseReview = () => {
    const lines: string[] = ['REVISE REVIEW:'];

    if (revisionNote.trim()) {
      lines.push('\nGeneral revision notes:');
      lines.push(revisionNote.trim());
    }

    if (commentsChanged && comments.length > 0) {
      lines.push('\nUser-edited inline review notes:');
      for (const comment of comments) {
        const typeLabel = comment.kind === 'suggestion' ? 'Suggestion' : 'Comment';
        const location = `${comment.filePath} ${formatLineRef(comment)}`;
        lines.push(`- [${typeLabel}] ${location}: "${comment.content.trim()}"`);
        if (comment.kind === 'suggestion' && comment.suggestion?.trim()) {
          lines.push(`  Suggested change: "${comment.suggestion.trim()}"`);
        }
      }
    }

    onRequestChanges(lines.join('\n'));
  };

  return (
    <div className="pr-review-approval-view">
      <div className="pr-review-approval-header">
        <div className="pr-review-approval-title">
          <div className="pr-review-approval-title-row">
            <McpIcon type="github" size={20} />
            <h3>{action || 'Review Pull Request'}</h3>
          </div>
          <div className="pr-review-approval-pr-title">{prTitle || 'Pull Request'}</div>
          <div className="pr-review-approval-meta">
            {owner && repo && (
              <code className="pr-review-repo-code">
                {owner}/{repo}
                {typeof pullNumber === 'number' ? `  PR #${pullNumber}` : ''}
              </code>
            )}
            <span className="pr-review-approval-branch-arrow">←</span>
            <code className="pr-review-branch-code">{headBranch || head || 'feature'}</code>
            <span className="pr-review-approval-branch-into">into</span>
            <code className="pr-review-branch-code">{baseBranch || base || 'main'}</code>
          </div>
          {author && (
            <div className="pr-review-approval-author">
              <span className="pr-review-author-label">Author</span>
              <span className="pr-review-author-handle">@{author}</span>
            </div>
          )}
        </div>
        <div className="pr-review-approval-stats">
          <span className="stat-files">{totalFiles} files</span>
          <span className="stat-additions">+{totalAdditions}</span>
          <span className="stat-deletions">-{totalDeletions}</span>
          <span className="stat-comments">{comments.length} notes</span>
        </div>
      </div>

      <div className="pr-review-approval-content">
        <div className={`pr-review-approval-main ${files.length === 0 ? 'pr-review-approval-main-empty' : ''}`}>
          {files.length > 0 && (
            <div className="pr-review-approval-files">
              <FileTree
                files={files}
                selectedFile={selectedFile}
                onSelect={handleFileSelect}
                noteCounts={noteCountsByFile}
              />
            </div>
          )}

          <div className="pr-review-approval-diff" ref={diffViewerRef}>
            {files.length === 0 ? (
              <div className="pr-review-approval-empty">
                <div className="pr-review-approval-empty-icon">!</div>
                <div className="pr-review-approval-empty-title">No diff provided</div>
                <div className="pr-review-approval-empty-message">
                  Include a unified diff in the approval payload to review inline comments and suggestions.
                </div>
              </div>
            ) : (
              <DiffViewer
                files={files}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                comments={comments}
                onAddComment={handleAddComment}
                onRemoveComment={handleRemoveComment}
                activeCommentId={activeInlineNoteId}
                commentMode="comment-and-suggestion"
              />
            )}
          </div>
        </div>

      </div>

      <div className="pr-review-approval-footer">
        <div className="pr-review-footer-top">
          <div className="pr-review-decision-pills">
            {(['COMMENT', 'REQUEST_CHANGES', 'APPROVE'] as const).map((value) => (
              <button
                key={value}
                className={`pr-review-decision-pill ${reviewDecision === value ? 'active' : ''}`}
                onClick={() => setReviewDecision(value)}
                disabled={isLoading}
              >
                {value === 'COMMENT' ? 'Comment' : value === 'REQUEST_CHANGES' ? 'Request Changes' : 'Approve'}
              </button>
            ))}
          </div>
          <textarea
            className="pr-review-body-textarea"
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder="Review comment (posted to the pull request)..."
            rows={4}
            disabled={isLoading}
          />
        </div>

        {showAgentFeedback && (
          <div className="pr-review-agent-feedback">
            <div className="pr-review-agent-feedback-bar">
              <span className="pr-review-agent-feedback-label">Agent feedback</span>
              <button
                className="pr-review-agent-feedback-dismiss"
                onClick={() => { setShowAgentFeedback(false); setRevisionNote(''); }}
              >
                Cancel
              </button>
            </div>
            <textarea
              id="pr-review-revision-textarea"
              className="pr-review-textarea"
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="Tell the agent how to revise this review..."
              rows={2}
              autoFocus
              disabled={isLoading}
            />
          </div>
        )}

        <ApprovalFooter
          onApprove={handleApprove}
          onRequestChanges={handleReviseOrExpand}
          onCancel={onCancel}
          isLoading={isLoading}
          approveLabel="Submit Review"
          commentCount={comments.length}
          requestChangesLabel={showAgentFeedback ? 'Send to Agent' : 'Revise with Agent'}
          requestChangesDisabled={showAgentFeedback && !hasRevisionNote}
          requestChangesDisabledTitle="Add a revision note"
        />
      </div>
    </div>
  );
}
