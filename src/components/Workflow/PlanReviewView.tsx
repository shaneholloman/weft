import { useState } from 'react';
import { Button } from '../common';
import type { WorkflowPlan } from '../../types';
import './PlanReviewView.css';

interface PlanReviewViewProps {
  plan: WorkflowPlan;
  onBack: () => void;
  onApprove: () => void;
  loading?: boolean;
}

/**
 * Wizard-style view for reviewing a workflow plan before approval.
 * Renders inline within TaskModal (no separate modal).
 * Only shown when plan is ready (loading state stays in main view).
 */
export function PlanReviewView({
  plan,
  onBack,
  onApprove,
  loading = false,
}: PlanReviewViewProps) {
  const [showCode, setShowCode] = useState(false);

  const steps = plan.steps || [];

  return (
    <div className="plan-review-view">
      <div className="plan-review">
        {/* Summary */}
        {plan.summary && (
          <div className="plan-section">
            <p className="plan-summary-text">{plan.summary}</p>
          </div>
        )}

        {/* Steps */}
        <div className="plan-section">
          <h4 className="plan-section-title">Steps ({steps.length})</h4>
          <div className="plan-steps-list">
            {steps.map((step, index) => (
              <div key={step.id} className={`plan-step ${step.type === 'checkpoint' ? 'checkpoint' : ''}`}>
                <div className="plan-step-number">{index + 1}</div>
                <div className="plan-step-content">
                  <div className="plan-step-name">{step.name}</div>
                  {step.mcpServer && (
                    <div className="plan-step-meta">
                      <span className="plan-step-server">{step.mcpServer}</span>
                      {step.toolName && <span className="plan-step-tool">{step.toolName}</span>}
                    </div>
                  )}
                  {step.type === 'checkpoint' && (
                    <div className="plan-step-checkpoint-badge">Requires approval</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Generated Code (collapsible) */}
        {plan.generatedCode && (
          <div className="plan-section">
            <button
              className="plan-code-toggle"
              onClick={() => setShowCode(!showCode)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showCode ? (
                  <path d="M19 9l-7 7-7-7" />
                ) : (
                  <path d="M9 5l7 7-7 7" />
                )}
              </svg>
              {showCode ? 'Hide generated code' : 'Show generated code'}
            </button>
            {showCode && (
              <pre className="plan-code">
                <code>{plan.generatedCode}</code>
              </pre>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="plan-actions">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onApprove} disabled={loading}>
            {loading ? 'Starting...' : 'Run Workflow'}
          </Button>
        </div>
      </div>
    </div>
  );
}
