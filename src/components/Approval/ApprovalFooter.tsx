/**
 * Approval Footer
 *
 * Shared footer for all approval views with three actions:
 * - Cancel (abort workflow)
 * - Request Changes (send feedback, agent iterates)
 * - Approve (accept as-is)
 *
 * Feedback is now collected inline on fields, not in a general textarea.
 */

import { Button } from '../common';

interface ApprovalFooterProps {
  onApprove: () => void;
  onRequestChanges: () => void;
  onCancel: () => void;
  isLoading: boolean;
  approveLabel?: string;
  approveDisabled?: boolean;
  commentCount?: number;
  requestChangesLabel?: string;
  requestChangesDisabled?: boolean;
  requestChangesDisabledTitle?: string;
}

export function ApprovalFooter({
  onApprove,
  onRequestChanges,
  onCancel,
  isLoading,
  approveLabel = 'Approve',
  approveDisabled = false,
  commentCount = 0,
  requestChangesLabel,
  requestChangesDisabled,
  requestChangesDisabledTitle,
}: ApprovalFooterProps) {
  const hasComments = commentCount > 0;
  const computedRequestChangesLabel = requestChangesLabel || (hasComments
    ? `Request Changes (${commentCount})`
    : 'Request Changes');
  const isRequestChangesDisabled = requestChangesDisabled ?? !hasComments;
  const requestChangesTitle = requestChangesDisabledTitle ?? (!hasComments ? 'Add comments to request changes' : undefined);

  return (
    <div className="approval-footer">
      <div className="approval-footer-actions">
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={isLoading}
        >
          Reject
        </Button>

        <div className="approval-footer-primary-actions">
          <Button
            variant="default"
            onClick={onRequestChanges}
            disabled={isLoading || isRequestChangesDisabled}
            title={requestChangesTitle}
          >
            {isLoading ? 'Sending...' : computedRequestChangesLabel}
          </Button>
          <Button
            variant="primary"
            onClick={onApprove}
            disabled={approveDisabled || isLoading}
          >
            {isLoading ? 'Processing...' : approveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
