/**
 * Approval Views Module
 *
 * Composable approval views for different MCP tools.
 */

export { getApprovalView } from './ApprovalViewRegistry';
export type { ApprovalViewProps } from './ApprovalViewRegistry';
export { DefaultApproval } from './DefaultApproval';
export { GitHubPRApproval } from './GitHubPRApproval';
