/**
 * GitHub PR Approval View
 *
 * Full diff viewer for approving pull request creation.
 * Shows the complete diff with file tree, editable PR title/body.
 */

import { useState, useRef, useMemo } from 'react';
import { Input, McpIcon } from '../common';
import { ApprovalFooter } from './ApprovalFooter';
import { DiffViewer, FileTree } from '../DiffViewer/DiffViewer';
import { parseDiff } from '../../utils/diffParser';
import type { ApprovalViewProps } from './ApprovalViewRegistry';
import type { DiffComment } from '../../types';
import './GitHubPRApproval.css';

interface PRApprovalData {
  owner?: string;
  repo?: string;
  baseBranch?: string;  // GitHub tool
  headBranch?: string;
  base?: string;        // Sandbox tool
  branch?: string;
  title?: string;
  body?: string;
  diff?: string;
  stats?: {
    files?: number;
    additions?: number;
    deletions?: number;
  };
}

export function GitHubPRApproval({
  action,
  data,
  onApprove,
  onRequestChanges,
  onCancel,
  isLoading,
}: ApprovalViewProps) {
  const diffViewerRef = useRef<HTMLDivElement>(null);
  const [comments, setComments] = useState<DiffComment[]>([]);

  // Parse data - handle JSON string case
  let prData: PRApprovalData = {};
  if (typeof data === 'string') {
    try {
      prData = JSON.parse(data);
    } catch {
      prData = {};
    }
  } else {
    prData = data as PRApprovalData;
  }

  const {
    owner = '',
    repo = '',
    baseBranch,
    headBranch,
    base,
    branch,
    title: proposedTitle = '',
    body: proposedBody = '',
    diff = '',
    stats,
  } = prData;

  const targetBranch = baseBranch || base || 'main';
  const sourceBranch = headBranch || branch || '';

  // Parse the diff content
  const files = useMemo(() => parseDiff(diff), [diff]);

  // Editable PR title and body
  const [prTitle, setPrTitle] = useState(proposedTitle);
  const [prBody, setPrBody] = useState(proposedBody);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(
    files.length > 0 ? files[0].path : undefined
  );

  // Calculate stats from parsed diff if not provided
  const totalFiles = stats?.files ?? files.length;
  const totalAdditions = stats?.additions ?? files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = stats?.deletions ?? files.reduce((sum, f) => sum + f.deletions, 0);

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    // Scroll the file into view in the diff viewer
    if (diffViewerRef.current) {
      const fileElement = diffViewerRef.current.querySelector(`[data-file-path="${CSS.escape(path)}"]`);
      if (fileElement) {
        fileElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Comment handlers for diff
  const handleAddComment = (comment: Omit<DiffComment, 'id'>) => {
    const newComment: DiffComment = {
      ...comment,
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    setComments((prev) => [...prev, newComment]);
  };

  const handleRemoveComment = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  // Format comments as feedback for the agent
  const formatCommentsFeedback = (): string => {
    if (comments.length === 0) return '';

    const lines: string[] = ['DIFF COMMENTS:'];

    // Group by file
    const byFile = comments.reduce((acc, c) => {
      if (!acc[c.filePath]) acc[c.filePath] = [];
      acc[c.filePath].push(c);
      return acc;
    }, {} as Record<string, DiffComment[]>);

    for (const [filePath, fileComments] of Object.entries(byFile)) {
      lines.push(`\nFile: ${filePath}`);
      for (const c of fileComments) {
        const lineRef = c.endLine && c.endLine !== c.lineNumber
          ? `Lines ${c.lineNumber}-${c.endLine}`
          : `Line ${c.lineNumber}`;
        lines.push(`  ${lineRef}: "${c.content}"`);
      }
    }

    return lines.join('\n');
  };

  const handleApprove = () => {
    // Pass back user-edited title/body
    (onApprove as (responseData?: Record<string, unknown>) => void)({
      title: prTitle.trim() || proposedTitle,
      body: prBody.trim(),
    });
  };

  const handleRequestChanges = () => {
    const feedback = formatCommentsFeedback();
    onRequestChanges(feedback);
  };

  return (
    <div className="pr-approval-view">
      {/* Header */}
      <div className="pr-approval-header">
        <div className="pr-approval-title">
          <div className="pr-approval-title-row">
            <McpIcon type="github" size={20} />
            <h3>{action || 'Create Pull Request'}</h3>
          </div>
          <div className="pr-approval-repo">
            {owner && repo && <><code>{owner}/{repo}</code><span className="pr-approval-branch-arrow">←</span></>}
            <code className="pr-approval-branch">{sourceBranch}</code>
            <span className="pr-approval-branch-into">into</span>
            <code className="pr-approval-branch">{targetBranch}</code>
          </div>
        </div>
        <div className="pr-approval-stats">
          <span className="stat-files">{totalFiles} files</span>
          <span className="stat-additions">+{totalAdditions}</span>
          <span className="stat-deletions">-{totalDeletions}</span>
        </div>
      </div>

      {/* Content */}
      <div className={`pr-approval-content ${files.length === 0 ? 'pr-approval-content-empty' : ''}`}>
        {files.length === 0 ? (
          <div className="pr-approval-empty">
            <div className="pr-approval-empty-icon">!</div>
            <div className="pr-approval-empty-title">No diff provided</div>
            <div className="pr-approval-empty-message">
              The agent should use Sandbox to make changes and include the diff in the approval request.
            </div>
          </div>
        ) : (
          <>
            {/* Sidebar */}
            <div className="pr-approval-sidebar">
              <FileTree
                files={files}
                selectedFile={selectedFile}
                onSelect={handleFileSelect}
              />
            </div>

            {/* Diff View */}
            <div className="pr-approval-diff" ref={diffViewerRef}>
              <DiffViewer
                files={files}
                selectedFile={selectedFile}
                onFileSelect={setSelectedFile}
                comments={comments}
                onAddComment={handleAddComment}
                onRemoveComment={handleRemoveComment}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer with PR form */}
      <div className="pr-approval-footer">
        <div className="pr-approval-form">
          <div className="pr-approval-form-fields">
            <Input
              label="PR Title"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder="Enter PR title..."
              disabled={isLoading}
            />
            <div className="pr-approval-form-body">
              <label className="input-label">Description</label>
              <textarea
                className="pr-approval-textarea"
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                placeholder="Describe the changes..."
                rows={3}
                disabled={isLoading}
              />
            </div>
          </div>
          <ApprovalFooter
            onApprove={handleApprove}
            onRequestChanges={handleRequestChanges}
            onCancel={onCancel}
            isLoading={isLoading}
            approveLabel="Create Pull Request"
            approveDisabled={!prTitle.trim()}
            commentCount={comments.length}
          />
        </div>
      </div>
    </div>
  );
}
