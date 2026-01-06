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
}

export function ApprovalFooter({
  onApprove,
  onRequestChanges,
  onCancel,
  isLoading,
  approveLabel = 'Approve',
  approveDisabled = false,
  commentCount = 0,
}: ApprovalFooterProps) {
  const hasComments = commentCount > 0;
  const requestChangesLabel = hasComments
    ? `Request Changes (${commentCount})`
    : 'Request Changes';

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
            disabled={isLoading || !hasComments}
            title={!hasComments ? 'Add comments to request changes' : undefined}
          >
            {isLoading ? 'Sending...' : requestChangesLabel}
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
