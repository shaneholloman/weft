/**
 * OAuth endpoint discovery for MCP servers
 *
 * Implements RFC 9728 (Protected Resource Metadata) and
 * RFC 8414 (Authorization Server Metadata) discovery.
 */

import type {
  OAuthProtectedResourceMetadata,
  OAuthAuthorizationServerMetadata,
  MCPOAuthMetadata,
  OAuthDiscoveryResult,
} from './types';
import { logger } from '../../utils/logger';

const DISCOVERY_TIMEOUT = 10000; // 10 seconds

/**
 * Discover OAuth endpoints for an MCP server
 *
 * Tries multiple discovery methods:
 * 1. Protected Resource Metadata (/.well-known/oauth-protected-resource) -> auth server metadata
 * 2. Direct Authorization Server Metadata (/.well-known/oauth-authorization-server)
 * 3. OpenID Connect Discovery (/.well-known/openid-configuration)
 */
export async function discoverOAuthEndpoints(mcpServerUrl: string): Promise<OAuthDiscoveryResult> {
  try {
    // Normalize URL
    const baseUrl = new URL(mcpServerUrl);
    baseUrl.pathname = baseUrl.pathname.replace(/\/$/, '');

    // Method 1: Try Protected Resource Metadata first (RFC 9728)
    const protectedResourceMetadata = await fetchProtectedResourceMetadata(baseUrl.origin);

    let authServerMetadata: OAuthAuthorizationServerMetadata | null = null;
    let authServerUrl = baseUrl.origin;

    if (protectedResourceMetadata?.authorization_servers?.length) {
      // Follow the protected resource metadata to the auth server
      authServerUrl = protectedResourceMetadata.authorization_servers[0];
      authServerMetadata = await fetchAuthorizationServerMetadata(authServerUrl);
    }

    // Method 2: If protected resource didn't work, try direct auth server metadata
    if (!authServerMetadata) {
      authServerMetadata = await fetchAuthorizationServerMetadata(baseUrl.origin);
    }

    // If we still don't have metadata, fail
    if (!authServerMetadata) {
      return {
        success: false,
        error: 'Could not discover OAuth endpoints. Server may not support OAuth.',
      };
    }

    // Validate required fields
    if (!authServerMetadata.authorization_endpoint) {
      return {
        success: false,
        error: 'Authorization server metadata missing authorization_endpoint',
      };
    }

    if (!authServerMetadata.token_endpoint) {
      return {
        success: false,
        error: 'Authorization server metadata missing token_endpoint',
      };
    }

    // Check PKCE support (required for MCP)
    const supportsPKCE = authServerMetadata.code_challenge_methods_supported?.includes('S256');
    if (!supportsPKCE) {
      logger.mcpOAuth.warn('Authorization server does not advertise S256 PKCE support, proceeding anyway');
    }

    // Build combined metadata
    const metadata: MCPOAuthMetadata = {
      resource: protectedResourceMetadata?.resource || authServerMetadata.issuer || baseUrl.origin,
      authorizationServer: authServerMetadata.issuer || authServerUrl,
      scopesSupported: protectedResourceMetadata?.scopes_supported || authServerMetadata.scopes_supported,
      authorizationEndpoint: authServerMetadata.authorization_endpoint,
      tokenEndpoint: authServerMetadata.token_endpoint,
      registrationEndpoint: authServerMetadata.registration_endpoint,
      revocationEndpoint: authServerMetadata.revocation_endpoint,
      codeChallengeMethodsSupported: authServerMetadata.code_challenge_methods_supported,
      cachedAt: new Date().toISOString(),
    };

    return {
      success: true,
      metadata,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during OAuth discovery';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Fetch OAuth Protected Resource Metadata
 * Tries multiple endpoints per RFC 9728
 */
async function fetchProtectedResourceMetadata(baseUrl: string): Promise<OAuthProtectedResourceMetadata | null> {
  const endpoints = [
    `${baseUrl}/.well-known/oauth-protected-resource`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json() as OAuthProtectedResourceMetadata;
        return data;
      }
    } catch (error) {
      logger.mcpOAuth.warn('Failed to fetch protected resource metadata', { endpoint, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return null;
}

/**
 * Fetch OAuth Authorization Server Metadata
 * Tries multiple endpoints per RFC 8414
 */
async function fetchAuthorizationServerMetadata(authServerUrl: string): Promise<OAuthAuthorizationServerMetadata | null> {
  const url = new URL(authServerUrl);

  // Build endpoints to try based on RFC 8414
  const endpoints: string[] = [];

  if (url.pathname && url.pathname !== '/') {
    // Server with path: try path-specific first
    endpoints.push(`${url.origin}/.well-known/oauth-authorization-server${url.pathname}`);
    endpoints.push(`${url.origin}/.well-known/openid-configuration${url.pathname}`);
    endpoints.push(`${authServerUrl}/.well-known/openid-configuration`);
  } else {
    // Server at root
    endpoints.push(`${url.origin}/.well-known/oauth-authorization-server`);
    endpoints.push(`${url.origin}/.well-known/openid-configuration`);
  }

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json() as OAuthAuthorizationServerMetadata;

        // Validate issuer matches (security check per RFC 8414)
        if (data.issuer && data.issuer !== authServerUrl && data.issuer !== url.origin) {
          logger.mcpOAuth.warn('Issuer mismatch', { expected: authServerUrl, got: data.issuer });
          // Continue to try other endpoints
          continue;
        }

        return data;
      }
    } catch (error) {
      logger.mcpOAuth.warn('Failed to fetch auth server metadata', { endpoint, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return null;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
