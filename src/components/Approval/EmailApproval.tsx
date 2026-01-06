/**
 * Email Approval View
 *
 * Dedicated approval view for Gmail send/draft operations.
 * Displays email in familiar email-client style layout with
 * editable subject and commentable body.
 */

import { useState } from 'react';
import { McpIcon } from '../common';
import { ApprovalFooter } from './ApprovalFooter';
import { CommentableText, formatTextComments } from '../CommentableText/CommentableText';
import { useFieldComments, type FieldComment } from '../../hooks';
import type { TextComment } from '../../types';
import type { ApprovalViewProps } from './ApprovalViewRegistry';
import './EmailApproval.css';

interface EmailApprovalData {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
}

export function EmailApproval({
  action,
  data,
  onApprove,
  onRequestChanges,
  onCancel,
  isLoading,
}: ApprovalViewProps) {
  // Parse email data - handle JSON string case
  let emailData: EmailApprovalData = {};
  if (typeof data === 'string') {
    try {
      emailData = JSON.parse(data);
    } catch {
      emailData = {};
    }
  } else {
    emailData = data as EmailApprovalData;
  }

  const {
    to: proposedTo = '',
    cc: proposedCc = '',
    bcc: proposedBcc = '',
    subject: proposedSubject = '',
    body = '',
  } = emailData;

  // Editable fields
  const [emailTo, setEmailTo] = useState(proposedTo);
  const [emailCc, setEmailCc] = useState(proposedCc);
  const [emailBcc, setEmailBcc] = useState(proposedBcc);
  const [emailSubject, setEmailSubject] = useState(proposedSubject);

  // Body comments (line-level via CommentableText)
  const [bodyComments, setBodyComments] = useState<TextComment[]>([]);

  // Field comments using shared hook
  const {
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
    commentCount: fieldCommentCount,
  } = useFieldComments();

  // Body comment handlers
  const handleAddBodyComment = (comment: Omit<TextComment, 'id'>) => {
    const newComment: TextComment = {
      ...comment,
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    setBodyComments((prev) => [...prev, newComment]);
  };

  const handleRemoveBodyComment = (id: string) => {
    setBodyComments((prev) => prev.filter((c) => c.id !== id));
  };

  // Wrapper functions for the hook (to match component expectations)
  const handleStartFieldComment = (fieldKey: string) => startFieldComment(fieldKey);
  const handleEditFieldComment = (fieldKey: string, content: string) => editFieldComment(fieldKey, content);
  const handleSubmitFieldComment = (fieldKey: string, fieldLabel: string) => submitFieldComment(fieldKey, fieldLabel);
  const handleCancelFieldComment = () => cancelFieldComment();
  const handleRemoveFieldComment = (fieldKey: string) => removeFieldComment(fieldKey);

  // Total comments count
  const totalComments = bodyComments.length + fieldCommentCount;

  // Format all comments as feedback
  const formatAllFeedback = (): string => {
    const sections: string[] = [];

    // Field comments
    for (const fc of fieldComments) {
      sections.push(`[${fc.fieldLabel}]: "${fc.content}"`);
    }

    // Body comments
    if (bodyComments.length > 0) {
      sections.push(`[Message Body]\n${formatTextComments(bodyComments)}`);
    }

    return sections.join('\n\n');
  };

  const handleApprove = () => {
    // Pass back edited fields
    (onApprove as (responseData?: Record<string, unknown>) => void)({
      to: emailTo.trim() || proposedTo,
      cc: emailCc.trim() || undefined,
      bcc: emailBcc.trim() || undefined,
      subject: emailSubject.trim() || proposedSubject,
    });
  };

  const handleRequestChanges = () => {
    const feedback = formatAllFeedback();
    onRequestChanges(feedback);
  };

  // Determine action label
  const isSend = action?.toLowerCase().includes('send');
  const approveLabel = isSend ? 'Send Email' : 'Save Draft';

  return (
    <div className="email-approval-view">
      {/* Header */}
      <div className="email-approval-header">
        <McpIcon type="gmail" size={20} />
        <h3>{action || (isSend ? 'Send Email' : 'Create Draft')}</h3>
      </div>

      {/* Recipients Section */}
      <div className="email-approval-recipients">
        <RecipientField
          label="To"
          value={emailTo}
          onChange={setEmailTo}
          fieldKey="to"
          isCommenting={commentingField === 'to'}
          existingComment={getFieldComment('to')}
          commentInput={commentInput}
          onStartComment={() => handleStartFieldComment('to')}
          onCommentChange={setCommentInput}
          onSubmitComment={() => handleSubmitFieldComment('to', 'To')}
          onCancelComment={handleCancelFieldComment}
          onEditComment={(content) => handleEditFieldComment('to', content)}
          onRemoveComment={() => handleRemoveFieldComment('to')}
          disabled={isLoading}
        />
        {(emailCc || proposedCc) && (
          <RecipientField
            label="CC"
            value={emailCc}
            onChange={setEmailCc}
            fieldKey="cc"
            isCommenting={commentingField === 'cc'}
            existingComment={getFieldComment('cc')}
            commentInput={commentInput}
            onStartComment={() => handleStartFieldComment('cc')}
            onCommentChange={setCommentInput}
            onSubmitComment={() => handleSubmitFieldComment('cc', 'CC')}
            onCancelComment={handleCancelFieldComment}
            onEditComment={(content) => handleEditFieldComment('cc', content)}
            onRemoveComment={() => handleRemoveFieldComment('cc')}
            disabled={isLoading}
          />
        )}
        {(emailBcc || proposedBcc) && (
          <RecipientField
            label="BCC"
            value={emailBcc}
            onChange={setEmailBcc}
            fieldKey="bcc"
            isCommenting={commentingField === 'bcc'}
            existingComment={getFieldComment('bcc')}
            commentInput={commentInput}
            onStartComment={() => handleStartFieldComment('bcc')}
            onCommentChange={setCommentInput}
            onSubmitComment={() => handleSubmitFieldComment('bcc', 'BCC')}
            onCancelComment={handleCancelFieldComment}
            onEditComment={(content) => handleEditFieldComment('bcc', content)}
            onRemoveComment={() => handleRemoveFieldComment('bcc')}
            disabled={isLoading}
          />
        )}
      </div>

      {/* Subject (editable with comment) */}
      <div className="email-approval-subject">
        <RecipientField
          label="Subject"
          value={emailSubject}
          onChange={setEmailSubject}
          fieldKey="subject"
          isCommenting={commentingField === 'subject'}
          existingComment={getFieldComment('subject')}
          commentInput={commentInput}
          onStartComment={() => handleStartFieldComment('subject')}
          onCommentChange={setCommentInput}
          onSubmitComment={() => handleSubmitFieldComment('subject', 'Subject')}
          onCancelComment={handleCancelFieldComment}
          onEditComment={(content) => handleEditFieldComment('subject', content)}
          onRemoveComment={() => handleRemoveFieldComment('subject')}
          disabled={isLoading}
        />
      </div>

      {/* Body (commentable) */}
      <div className="email-approval-body">
        <CommentableText
          content={body}
          label="Message"
          comments={bodyComments}
          onAddComment={handleAddBodyComment}
          onRemoveComment={handleRemoveBodyComment}
          disabled={isLoading}
          variant="prose"
        />
      </div>

      {/* Footer */}
      <ApprovalFooter
        onApprove={handleApprove}
        onRequestChanges={handleRequestChanges}
        onCancel={onCancel}
        isLoading={isLoading}
        approveLabel={approveLabel}
        approveDisabled={!emailSubject.trim()}
        commentCount={totalComments}
      />
    </div>
  );
}

/**
 * Recipient field with comment support
 */
interface RecipientFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fieldKey: string;
  isCommenting: boolean;
  existingComment?: FieldComment;
  commentInput: string;
  onStartComment: () => void;
  onCommentChange: (value: string) => void;
  onSubmitComment: () => void;
  onCancelComment: () => void;
  onEditComment: (content: string) => void;
  onRemoveComment: () => void;
  disabled: boolean;
}

function RecipientField({
  label,
  value,
  onChange,
  isCommenting,
  existingComment,
  commentInput,
  onStartComment,
  onCommentChange,
  onSubmitComment,
  onCancelComment,
  onEditComment,
  onRemoveComment,
  disabled,
}: RecipientFieldProps) {
  return (
    <div className="email-recipient-field">
      <div className="email-recipient-row">
        <span className="email-recipient-label">{label}:</span>
        <input
          type="text"
          className="email-recipient-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={`Enter ${label.toLowerCase()}...`}
        />
        {!isCommenting && !existingComment && !disabled && (
          <button
            className="email-recipient-add-comment"
            onClick={onStartComment}
            title="Add comment"
          >
            + comment
          </button>
        )}
      </div>

      {/* Comment input */}
      {isCommenting && (
        <div className="email-recipient-comment-input">
          <input
            type="text"
            value={commentInput}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Add your feedback..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && commentInput.trim()) {
                onSubmitComment();
              } else if (e.key === 'Escape') {
                onCancelComment();
              }
            }}
          />
          <div className="email-recipient-comment-actions">
            <button onClick={onCancelComment}>Cancel</button>
            <button
              onClick={onSubmitComment}
              disabled={!commentInput.trim()}
              className="primary"
            >
              Add Comment
            </button>
          </div>
        </div>
      )}

      {/* Existing comment */}
      {existingComment && !isCommenting && (
        <div className="email-recipient-comment">
          <span className="email-recipient-comment-content">{existingComment.content}</span>
          <button
            className="email-recipient-comment-edit"
            onClick={() => onEditComment(existingComment.content)}
            title="Edit comment"
          >
            Edit
          </button>
          <button
            className="email-recipient-comment-remove"
            onClick={onRemoveComment}
            title="Remove comment"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
