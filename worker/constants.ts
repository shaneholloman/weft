/**
 * Shared constants for the worker
 */

// Credential types
export const CREDENTIAL_TYPES = {
  GITHUB_OAUTH: 'github_oauth',
  GOOGLE_OAUTH: 'google_oauth',
  ANTHROPIC_API_KEY: 'anthropic_api_key',
} as const;

export type CredentialType = typeof CREDENTIAL_TYPES[keyof typeof CREDENTIAL_TYPES];

// MCP Server names (for matching)
export const MCP_SERVER_NAMES = {
  GMAIL: 'gmail',
  GOOGLE_DOCS: 'google docs',
  GITHUB: 'github',
} as const;

// Account IDs (used in AccountMCPRegistry)
export const ACCOUNT_IDS = {
  GOOGLE: 'google',
  GITHUB: 'github',
} as const;
