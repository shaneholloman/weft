import {
  discoverOAuthEndpoints,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  registerClient,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  parseState,
  type MCPOAuthMetadata,
} from '../mcp/oauth';
import { jsonResponse } from '../utils/response';
import { logger } from '../utils/logger';
import { toCamelCase } from '../utils/transformations';
import type { CredentialService } from './CredentialService';
import type { MCPService } from './MCPService';

export class MCPOAuthService {
  private sql: SqlStorage;
  private credentialService: CredentialService;
  private mcpService: MCPService;
  private generateId: () => string;

  constructor(
    sql: SqlStorage,
    credentialService: CredentialService,
    mcpService: MCPService,
    generateId: () => string
  ) {
    this.sql = sql;
    this.credentialService = credentialService;
    this.mcpService = mcpService;
    this.generateId = generateId;
  }

  /**
   * Discover OAuth endpoints for a remote MCP server
   */
  async discoverMCPOAuth(serverId: string): Promise<Response> {
    const serverRow = this.mcpService.getServerRow(serverId);

    if (!serverRow) {
      return jsonResponse({ success: false, error: { code: 'NOT_FOUND', message: 'MCP server not found' } }, 404);
    }

    const server = toCamelCase(serverRow) as {
      id: string;
      endpoint?: string;
      type: string;
    };

    if (server.type !== 'remote' || !server.endpoint) {
      return jsonResponse({
        success: false,
        error: { code: 'INVALID_SERVER', message: 'Only remote MCP servers support OAuth discovery' }
      }, 400);
    }

    const result = await discoverOAuthEndpoints(server.endpoint);

    if (!result.success || !result.metadata) {
      return jsonResponse({
        success: false,
        error: { code: 'DISCOVERY_FAILED', message: result.error || 'OAuth discovery failed' }
      }, 400);
    }

    // Cache the OAuth metadata
    this.mcpService.updateOAuthMetadata(serverId, result.metadata);

    return jsonResponse({
      success: true,
      data: result.metadata
    });
  }

  /**
   * Get OAuth authorization URL for a remote MCP server
   */
  async getMCPOAuthUrl(serverId: string, params: URLSearchParams): Promise<Response> {
    const redirectUri = params.get('redirectUri');
    if (!redirectUri) {
      return jsonResponse({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'redirectUri is required' }
      }, 400);
    }

    const serverRow = this.mcpService.getServerRow(serverId);

    if (!serverRow) {
      return jsonResponse({ success: false, error: { code: 'NOT_FOUND', message: 'MCP server not found' } }, 404);
    }

    const server = toCamelCase(serverRow) as {
      id: string;
      name: string;
      boardId: string;
      endpoint?: string;
      oauthMetadata?: string;
    };

    if (!server.oauthMetadata) {
      return jsonResponse({
        success: false,
        error: { code: 'NO_OAUTH_METADATA', message: 'OAuth discovery has not been performed for this server' }
      }, 400);
    }

    const metadata = JSON.parse(server.oauthMetadata) as MCPOAuthMetadata;

    // Dynamic Client Registration (RFC 7591)
    let clientId = redirectUri;
    let clientSecret: string | null = null;

    if (metadata.registrationEndpoint) {
      const regResult = await registerClient(metadata, {
        redirectUri,
        clientName: `Weft - ${server.name}`,
      });

      if (regResult.success && regResult.clientId) {
        clientId = regResult.clientId;
        clientSecret = regResult.clientSecret || null;
      } else {
        logger.mcpOAuth.warn('Dynamic client registration failed', { error: regResult.error });
      }
    }

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState(server.boardId, serverId);

    // Store pending authorization
    const pendingId = this.generateId();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    this.sql.exec(
      `INSERT INTO mcp_oauth_pending (id, board_id, server_id, code_verifier, state, resource, scopes, client_id, client_secret, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pendingId,
      server.boardId,
      serverId,
      codeVerifier,
      state,
      metadata.resource,
      metadata.scopesSupported?.join(' ') || null,
      clientId,
      clientSecret,
      now,
      expiresAt
    );

    // Build authorization URL
    const authUrl = buildAuthorizationUrl(metadata, {
      clientId,
      redirectUri,
      state,
      codeChallenge,
      scopes: metadata.scopesSupported,
    });

    return jsonResponse({
      success: true,
      data: {
        url: authUrl,
        state,
      }
    });
  }

  /**
   * Exchange OAuth authorization code for tokens
   */
  async exchangeMCPOAuthCode(serverId: string, data: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<Response> {
    // Validate state
    const parsedState = parseState(data.state);
    if (!parsedState) {
      return jsonResponse({
        success: false,
        error: { code: 'INVALID_STATE', message: 'Invalid or malformed state parameter' }
      }, 400);
    }

    if (parsedState.serverId !== serverId) {
      return jsonResponse({
        success: false,
        error: { code: 'STATE_MISMATCH', message: 'State does not match server' }
      }, 400);
    }

    // Get pending authorization
    const pendingRow = this.sql.exec(
      'SELECT * FROM mcp_oauth_pending WHERE state = ? AND server_id = ?',
      data.state,
      serverId
    ).toArray()[0] as Record<string, unknown> | undefined;

    if (!pendingRow) {
      return jsonResponse({
        success: false,
        error: { code: 'NO_PENDING', message: 'No pending OAuth authorization found' }
      }, 400);
    }

    const pending = toCamelCase(pendingRow) as {
      id: string;
      boardId: string;
      codeVerifier: string;
      clientId?: string;
      clientSecret?: string;
      expiresAt: string;
    };

    // Check expiration
    if (new Date(pending.expiresAt) < new Date()) {
      this.sql.exec('DELETE FROM mcp_oauth_pending WHERE id = ?', pending.id);
      return jsonResponse({
        success: false,
        error: { code: 'EXPIRED', message: 'OAuth authorization has expired' }
      }, 400);
    }

    // Get server and OAuth metadata
    const serverRow = this.mcpService.getServerRow(serverId);

    if (!serverRow) {
      return jsonResponse({ success: false, error: { code: 'NOT_FOUND', message: 'MCP server not found' } }, 404);
    }

    const server = toCamelCase(serverRow) as {
      id: string;
      name: string;
      oauthMetadata?: string;
    };

    if (!server.oauthMetadata) {
      return jsonResponse({
        success: false,
        error: { code: 'NO_OAUTH_METADATA', message: 'OAuth metadata not found' }
      }, 400);
    }

    const metadata = JSON.parse(server.oauthMetadata) as MCPOAuthMetadata;
    const clientId = pending.clientId || data.redirectUri;

    // Exchange code for tokens
    const tokenResult = await exchangeCodeForTokens(metadata, {
      code: data.code,
      codeVerifier: pending.codeVerifier,
      clientId,
      redirectUri: data.redirectUri,
    });

    // Delete pending authorization
    this.sql.exec('DELETE FROM mcp_oauth_pending WHERE id = ?', pending.id);

    if (!tokenResult.success || !tokenResult.accessToken) {
      return jsonResponse({
        success: false,
        error: { code: 'TOKEN_EXCHANGE_FAILED', message: tokenResult.error || 'Token exchange failed' }
      }, 400);
    }

    // Store tokens as credential
    const credentialId = this.generateId();
    const now = new Date().toISOString();
    const encryptedToken = await this.credentialService.encrypt(tokenResult.accessToken);

    this.sql.exec(
      `INSERT INTO board_credentials (id, board_id, type, name, encrypted_value, metadata, created_at, updated_at)
       VALUES (?, ?, 'mcp_oauth', ?, ?, ?, ?, ?)`,
      credentialId,
      pending.boardId,
      `MCP: ${server.name}`,
      encryptedToken,
      JSON.stringify({
        serverId: serverId,
        refreshToken: tokenResult.refreshToken,
        expiresAt: tokenResult.expiresAt,
        scope: tokenResult.scope,
      }),
      now,
      now
    );

    // Update MCP server
    this.mcpService.updateServerCredential(serverId, credentialId);

    // Try to discover tools
    try {
      await this.mcpService.connectMCPServer(serverId);
    } catch {
      // Non-fatal
    }

    return jsonResponse({
      success: true,
      data: {
        status: 'connected',
        credentialId,
      }
    });
  }
}
