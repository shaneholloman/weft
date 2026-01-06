/**
 * Shared constants for the frontend
 */

// Credential types - must match worker/constants.ts
export const CREDENTIAL_TYPES = {
  GITHUB_OAUTH: 'github_oauth',
  GOOGLE_OAUTH: 'google_oauth',
  ANTHROPIC_API_KEY: 'anthropic_api_key',
} as const;

export type CredentialType = typeof CREDENTIAL_TYPES[keyof typeof CREDENTIAL_TYPES];
