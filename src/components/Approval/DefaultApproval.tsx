/**
 * Default Approval View
 *
 * Generic key-value display for tool approvals.
 * Uses CommentableText for multi-line text fields to allow inline comments.
 * Short fields get a simple "add comment" button on hover.
 * Used as fallback when no specialized view exists.
 */

import { useState } from 'react';
import { McpIcon, getIconTypeFromTool } from '../common';
import { ApprovalFooter } from './ApprovalFooter';
import { CommentableText, formatTextComments } from '../CommentableText/CommentableText';
import { useFieldComments } from '../../hooks';
import type { TextComment } from '../../types';
import type { ApprovalViewProps } from './ApprovalViewRegistry';
import './Approval.css';

// Tool-specific configuration for approval UI
const TOOL_CONFIG: Record<string, {
  label: string;
  buttonLabel: string;
  fieldLabels: Record<string, string>;
  commentableFields?: string[];  // Fields that support line-level comments
  editableFields?: string[];     // Fields that are editable (with comment support)
}> = {
  'Google_Docs__createDocument': {
    label: 'Create Document',
    buttonLabel: 'Create Document',
    fieldLabels: { title: 'Document Name', content: 'Content' },
    commentableFields: ['content'],
    editableFields: ['title'],
  },
  'Gmail__sendMessage': {
    label: 'Send Email',
    buttonLabel: 'Send Email',
    fieldLabels: { to: 'To', subject: 'Subject', body: 'Message', cc: 'CC', bcc: 'BCC' },
    commentableFields: ['body'],
  },
  'Gmail__createDraft': {
    label: 'Create Draft',
    buttonLabel: 'Save Draft',
    fieldLabels: { to: 'To', subject: 'Subject', body: 'Message', cc: 'CC', bcc: 'BCC' },
    commentableFields: ['body'],
  },
  'Sandbox__runCode': {
    label: 'Run Code',
    buttonLabel: 'Run Code',
    fieldLabels: { code: 'Code', language: 'Language' },
    commentableFields: ['code'],
  },
};

// Get tool config with fallback to generic labels
function getToolConfig(toolName: string) {
  return TOOL_CONFIG[toolName] || {
    label: 'Execute Action',
    buttonLabel: 'Continue',
    fieldLabels: {},
  };
}

// Get field label with tool-specific mapping
function getFieldLabel(toolName: string, fieldKey: string): string {
  const config = TOOL_CONFIG[toolName];
  if (config?.fieldLabels[fieldKey]) {
    return config.fieldLabels[fieldKey];
  }
  // Fallback: convert camelCase to Title Case
  return fieldKey
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
}

// Text comments state keyed by field name (for multi-line fields)
interface TextCommentsMap {
  [fieldKey: string]: TextComment[];
}

export function DefaultApproval({
  tool,
  action,
  data,
  onApprove,
  onRequestChanges,
  onCancel,
  isLoading,
}: ApprovalViewProps) {
  const toolConfig = getToolConfig(tool);
  const iconType = getIconTypeFromTool(tool);

  // Text comments for multi-line fields (CommentableText)
  const [textComments, setTextComments] = useState<TextCommentsMap>({});

  // Field comments using shared hook
  const {
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

  // Edited field values (for editable fields)
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  // Wrap hook functions to match expected signatures
  const handleStartFieldComment = (fieldKey: string) => startFieldComment(fieldKey);
  const handleEditFieldComment = (fieldKey: string, content: string) => editFieldComment(fieldKey, content);
  const handleSubmitFieldComment = (fieldKey: string, fieldLabel: string) => submitFieldComment(fieldKey, fieldLabel);
  const handleCancelFieldComment = () => cancelFieldComment();
  const handleRemoveFieldComment = (fieldKey: string) => removeFieldComment(fieldKey);

  // Extract fields to display from data
  const fields: Array<{ key: string; label: string; value: string; isCommentable: boolean; isEditable: boolean }> = [];

  // Handle case where data might be a JSON string instead of object
  let dataObj = data;
  if (typeof dataObj === 'string') {
    try {
      dataObj = JSON.parse(dataObj);
    } catch {
      dataObj = {};
    }
  }

  const commentableFields = toolConfig.commentableFields || [];
  const editableFields = toolConfig.editableFields || [];

  if (dataObj && typeof dataObj === 'object') {
    Object.entries(dataObj as Record<string, unknown>).forEach(([key, value]) => {
      // Convert non-string values to readable strings
      const displayValue = typeof value === 'string'
        ? value
        : typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);
      if (displayValue.length > 0) {
        fields.push({
          key,
          label: getFieldLabel(tool, key),
          value: displayValue,
          isCommentable: commentableFields.includes(key),
          isEditable: editableFields.includes(key),
        });
      }
    });
  }

  // Handler for editable field changes
  const handleEditableChange = (fieldKey: string, newValue: string) => {
    setEditedValues((prev) => ({ ...prev, [fieldKey]: newValue }));
  };

  // Get current value for an editable field
  const getEditableValue = (field: { key: string; value: string }) => {
    return editedValues[field.key] ?? field.value;
  };

  // Text comment handlers (for multi-line fields)
  const handleAddTextComment = (fieldKey: string, comment: Omit<TextComment, 'id'>) => {
    const newComment: TextComment = {
      ...comment,
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    setTextComments((prev) => ({
      ...prev,
      [fieldKey]: [...(prev[fieldKey] || []), newComment],
    }));
  };

  const handleRemoveTextComment = (fieldKey: string, commentId: string) => {
    setTextComments((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] || []).filter((c) => c.id !== commentId),
    }));
  };

  // Get total comment count
  const textCommentCount = Object.values(textComments).reduce((sum, arr) => sum + arr.length, 0);
  const totalComments = textCommentCount + fieldCommentCount;

  // Format all comments as feedback
  const formatAllFeedback = (): string => {
    const sections: string[] = [];

    for (const field of fields) {
      if (field.isCommentable) {
        // Multi-line field - format text comments
        const comments = textComments[field.key] || [];
        if (comments.length > 0) {
          sections.push(`[${field.label}]\n${formatTextComments(comments)}`);
        }
      } else {
        // Short field - format field comment
        const comment = getFieldComment(field.key);
        if (comment) {
          sections.push(`[${field.label}]: "${comment.content}"`);
        }
      }
    }

    return sections.join('\n\n');
  };

  const handleRequestChanges = () => {
    const feedback = formatAllFeedback();
    onRequestChanges(feedback);
  };

  return (
    <div className="approval-card">
      {/* Header with icon and action */}
      <div className="approval-header">
        <McpIcon type={iconType} size={24} className="approval-icon" />
        <span className="approval-title">
          {action || toolConfig.label}
        </span>
      </div>

      {/* Fields */}
      <div className="approval-fields">
        {fields.map((field) => {
          const existingComment = getFieldComment(field.key);
          const isCommenting = commentingField === field.key;

          return (
            <div key={field.key} className="approval-field">
              {field.isCommentable ? (
                <CommentableText
                  content={field.value}
                  label={field.label}
                  comments={textComments[field.key] || []}
                  onAddComment={(comment) => handleAddTextComment(field.key, comment)}
                  onRemoveComment={(id) => handleRemoveTextComment(field.key, id)}
                  disabled={isLoading}
                />
              ) : field.isEditable ? (
                /* Editable field with input + comment support */
                <div className="approval-field-editable">
                  <div className="approval-field-header">
                    <label className="approval-field-label">{field.label}:</label>
                    <input
                      type="text"
                      className="approval-field-input"
                      value={getEditableValue(field)}
                      onChange={(e) => handleEditableChange(field.key, e.target.value)}
                      disabled={isLoading}
                      placeholder={`Enter ${field.label.toLowerCase()}...`}
                    />
                    {!isCommenting && !existingComment && !isLoading && (
                      <button
                        className="approval-field-add-comment"
                        onClick={() => handleStartFieldComment(field.key)}
                        title="Add comment"
                      >
                        + comment
                      </button>
                    )}
                  </div>

                  {/* Comment input */}
                  {isCommenting && (
                    <div className="approval-field-comment-input">
                      <input
                        type="text"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Add your feedback..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && commentInput.trim()) {
                            handleSubmitFieldComment(field.key, field.label);
                          } else if (e.key === 'Escape') {
                            handleCancelFieldComment();
                          }
                        }}
                      />
                      <div className="approval-field-comment-actions">
                        <button onClick={handleCancelFieldComment}>Cancel</button>
                        <button
                          onClick={() => handleSubmitFieldComment(field.key, field.label)}
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
                    <div className="approval-field-comment">
                      <span className="approval-field-comment-content">{existingComment.content}</span>
                      <button
                        className="approval-field-comment-edit"
                        onClick={() => handleEditFieldComment(field.key, existingComment.content)}
                        title="Edit comment"
                      >
                        Edit
                      </button>
                      <button
                        className="approval-field-comment-remove"
                        onClick={() => handleRemoveFieldComment(field.key)}
                        title="Remove comment"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Read-only field with comment support */
                <div className="approval-field-short">
                  <div className="approval-field-header">
                    <label className="approval-field-label">{field.label}</label>
                    {!isCommenting && !existingComment && !isLoading && (
                      <button
                        className="approval-field-add-comment"
                        onClick={() => handleStartFieldComment(field.key)}
                        title="Add comment"
                      >
                        + comment
                      </button>
                    )}
                  </div>
                  <div className="approval-field-value">{field.value}</div>

                  {/* Comment input */}
                  {isCommenting && (
                    <div className="approval-field-comment-input">
                      <input
                        type="text"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Add your feedback..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && commentInput.trim()) {
                            handleSubmitFieldComment(field.key, field.label);
                          } else if (e.key === 'Escape') {
                            handleCancelFieldComment();
                          }
                        }}
                      />
                      <div className="approval-field-comment-actions">
                        <button onClick={handleCancelFieldComment}>Cancel</button>
                        <button
                          onClick={() => handleSubmitFieldComment(field.key, field.label)}
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
                    <div className="approval-field-comment">
                      <span className="approval-field-comment-content">{existingComment.content}</span>
                      <button
                        className="approval-field-comment-edit"
                        onClick={() => handleEditFieldComment(field.key, existingComment.content)}
                        title="Edit comment"
                      >
                        Edit
                      </button>
                      <button
                        className="approval-field-comment-remove"
                        onClick={() => handleRemoveFieldComment(field.key)}
                        title="Remove comment"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with actions */}
      <ApprovalFooter
        onApprove={() => {
          // Pass back any edited field values
          if (Object.keys(editedValues).length > 0) {
            onApprove(editedValues);
          } else {
            onApprove();
          }
        }}
        onRequestChanges={handleRequestChanges}
        onCancel={onCancel}
        isLoading={isLoading}
        approveLabel={toolConfig.buttonLabel}
        commentCount={totalComments}
      />
    </div>
  );
}
