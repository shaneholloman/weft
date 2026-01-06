/**
 * GitHub services module
 *
 * Provides OAuth and MCP wrapper for GitHub:
 * - Repository operations
 * - Issues and pull requests
 */

export * from './oauth';
export { GitHubMCPServer } from './GitHubMCP';
