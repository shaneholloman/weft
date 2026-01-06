/**
 * Google services module
 *
 * Provides OAuth and MCP wrappers for Google services:
 * - Gmail
 * - Google Docs
 */

export * from './oauth';
export { GmailMCPServer } from './GmailMCP';
export { DocsMCPServer } from './DocsMCP';
