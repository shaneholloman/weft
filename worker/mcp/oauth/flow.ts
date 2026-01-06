/**
 * OAuth flow utilities for MCP servers
 *
 * Handles authorization URL building and token exchange.
 */

import type {
  MCPOAuthMetadata,
  OAuthTokenResponse,
  OAuthErrorResponse,
  OAuthTokenExchangeResult,
  OAuthClientRegistrationResponse,
  OAuthClientRegistrationResult,
} from './types';

const TOKEN_EXCHANGE_TIMEOUT = 30000; // 30 seconds
const REGISTRATION_TIMEOUT = 10000; // 10 seconds

/**
 * Register a client dynamically with the OAuth server (RFC 7591)
 */
export async function registerClient(
  metadata: MCPOAuthMetadata,
  params: {
    redirectUri: string;
    clientName?: string;
  }
): Promise<OAuthClientRegistrationResult> {
  if (!metadata.registrationEndpoint) {
    return {
      success: false,
      error: 'Server does not support dynamic client registration',
    };
  }

  try {
    const registrationRequest = {
      redirect_uris: [params.redirectUri],
      client_name: params.clientName || 'Weft MCP Client',
      token_endpoint_auth_method: 'none', // Public client (browser-based)
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REGISTRATION_TIMEOUT);

    try {
      const response = await fetch(metadata.registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(registrationRequest),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as OAuthErrorResponse;
        return {
          success: false,
          error: errorData.error_description || errorData.error || 'Client registration failed',
        };
      }

      const regData = data as OAuthClientRegistrationResponse;

      return {
        success: true,
        clientId: regData.client_id,
        clientSecret: regData.client_secret,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Client registration timed out',
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error during client registration';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Build OAuth authorization URL with PKCE
 */
export function buildAuthorizationUrl(
  metadata: MCPOAuthMetadata,
  params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    scopes?: string[];
    includeResource?: boolean; // Some servers don't support RFC 8707
  }
): string {
  const url = new URL(metadata.authorizationEndpoint);

  // Required parameters
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);

  // PKCE parameters (mandatory for MCP)
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  // Resource indicator (RFC 8707) - optional, some servers don't support it
  if (params.includeResource !== false) {
    // Only include if explicitly requested or by default for servers that might support it
    // But skip for now as many servers reject it
  }

  // Scopes
  if (params.scopes && params.scopes.length > 0) {
    url.searchParams.set('scope', params.scopes.join(' '));
  } else if (metadata.scopesSupported && metadata.scopesSupported.length > 0) {
    // Use all supported scopes if none specified
    url.searchParams.set('scope', metadata.scopesSupported.join(' '));
  }

  return url.toString();
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  metadata: MCPOAuthMetadata,
  params: {
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  }
): Promise<OAuthTokenExchangeResult> {
  try {
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', params.code);
    body.set('code_verifier', params.codeVerifier);
    body.set('client_id', params.clientId);
    body.set('redirect_uri', params.redirectUri);

    // Note: Resource indicator (RFC 8707) omitted - many servers don't support it

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT);

    try {
      const response = await fetch(metadata.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as OAuthErrorResponse;
        return {
          success: false,
          error: errorData.error_description || errorData.error || 'Token exchange failed',
        };
      }

      const tokenData = data as OAuthTokenResponse;

      // Calculate expiration time
      let expiresAt: string | undefined;
      if (tokenData.expires_in) {
        const expiresAtDate = new Date(Date.now() + tokenData.expires_in * 1000);
        expiresAt = expiresAtDate.toISOString();
      }

      return {
        success: true,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
        scope: tokenData.scope,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Token exchange timed out',
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error during token exchange';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(
  metadata: MCPOAuthMetadata,
  params: {
    refreshToken: string;
    clientId: string;
  }
): Promise<OAuthTokenExchangeResult> {
  try {
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', params.refreshToken);
    body.set('client_id', params.clientId);

    // Note: Resource indicator (RFC 8707) omitted - many servers don't support it

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT);

    try {
      const response = await fetch(metadata.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as OAuthErrorResponse;
        return {
          success: false,
          error: errorData.error_description || errorData.error || 'Token refresh failed',
        };
      }

      const tokenData = data as OAuthTokenResponse;

      // Calculate expiration time
      let expiresAt: string | undefined;
      if (tokenData.expires_in) {
        const expiresAtDate = new Date(Date.now() + tokenData.expires_in * 1000);
        expiresAt = expiresAtDate.toISOString();
      }

      return {
        success: true,
        accessToken: tokenData.access_token,
        // New refresh token may be issued (token rotation)
        refreshToken: tokenData.refresh_token,
        expiresAt,
        scope: tokenData.scope,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Token refresh timed out',
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error during token refresh';
    return {
      success: false,
      error: message,
    };
  }
}
