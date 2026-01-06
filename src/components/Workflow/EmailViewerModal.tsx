/**
 * Email Viewer
 *
 * Displays sent email content.
 * Used for viewing email artifacts.
 */

import { McpIcon } from '../common';
import type { WorkflowArtifact } from '../../types';
import './EmailViewerModal.css';

interface EmailViewerProps {
  content: WorkflowArtifact['content'];
}

function formatDate(isoString?: string) {
  if (!isoString) return null;
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Email content viewer (no modal wrapper)
 * Used inside TaskModal for email artifact viewing
 */
export function EmailViewer({ content }: EmailViewerProps) {
  if (!content) return null;

  return (
    <div className="email-viewer">
      {/* Email header */}
      <div className="email-viewer-header">
        <McpIcon type="gmail" size={20} />
        <div className="email-viewer-meta">
          <div className="email-viewer-field">
            <span className="email-viewer-label">To:</span>
            <span className="email-viewer-value">{content.to}</span>
          </div>
          {content.cc && (
            <div className="email-viewer-field">
              <span className="email-viewer-label">CC:</span>
              <span className="email-viewer-value">{content.cc}</span>
            </div>
          )}
          {content.bcc && (
            <div className="email-viewer-field">
              <span className="email-viewer-label">BCC:</span>
              <span className="email-viewer-value">{content.bcc}</span>
            </div>
          )}
          <div className="email-viewer-field">
            <span className="email-viewer-label">Subject:</span>
            <span className="email-viewer-value email-viewer-subject">{content.subject}</span>
          </div>
          {content.sentAt && (
            <div className="email-viewer-field">
              <span className="email-viewer-label">Sent:</span>
              <span className="email-viewer-value email-viewer-date">{formatDate(content.sentAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Email body */}
      <div className="email-viewer-body">
        <pre className="email-viewer-body-text">{content.body}</pre>
      </div>
    </div>
  );
}
