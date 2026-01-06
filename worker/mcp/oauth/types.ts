/**
 * OAuth types for MCP server authentication
 *
 * Based on RFC 8414 (OAuth Authorization Server Metadata),
 * RFC 9728 (OAuth Protected Resource Metadata), and MCP spec.
 */

/**
 * OAuth Protected Resource Metadata (RFC 9728)
 * Retrieved from /.well-known/oauth-protected-resource
 */
export interface OAuthProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_documentation?: string;
  resource_signing_alg_values_supported?: string[];
  resource_encryption_alg_values_supported?: string[];
  resource_encryption_enc_values_supported?: string[];
  resource_policy_uri?: string;
  resource_tos_uri?: string;
  jwks_uri?: string;
}

/**
 * OAuth Authorization Server Metadata (RFC 8414)
 * Retrieved from /.well-known/oauth-authorization-server
 */
export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  response_modes_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  token_endpoint_auth_signing_alg_values_supported?: string[];
  service_documentation?: string;
  ui_locales_supported?: string[];
  op_policy_uri?: string;
  op_tos_uri?: string;
  revocation_endpoint?: string;
  revocation_endpoint_auth_methods_supported?: string[];
  introspection_endpoint?: string;
  introspection_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
}

/**
 * Combined OAuth metadata for an MCP server
 * Stored in mcp_servers.oauth_metadata
 */
export interface MCPOAuthMetadata {
  // From protected resource metadata
  resource: string;
  authorizationServer: string;
  scopesSupported?: string[];

  // From authorization server metadata
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  revocationEndpoint?: string;
  codeChallengeMethodsSupported?: string[];

  // When this was fetched
  cachedAt: string;
}

/**
 * Pending OAuth authorization state
 * Stored in mcp_oauth_pending table
 */
export interface MCPOAuthPending {
  id: string;
  boardId: string;
  serverId: string;
  codeVerifier: string;
  state: string;
  resource: string;
  scopes?: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * OAuth token response from token endpoint
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth error response
 */
export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Discovery result from discoverOAuthEndpoints
 */
export interface OAuthDiscoveryResult {
  success: boolean;
  metadata?: MCPOAuthMetadata;
  error?: string;
}

/**
 * Authorization URL result
 */
export interface OAuthAuthorizationUrlResult {
  success: boolean;
  url?: string;
  state?: string;
  error?: string;
}

/**
 * Token exchange result
 */
export interface OAuthTokenExchangeResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  error?: string;
}

/**
 * Dynamic Client Registration request (RFC 7591)
 */
export interface OAuthClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
}

/**
 * Dynamic Client Registration response (RFC 7591)
 */
export interface OAuthClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  client_name?: string;
}

/**
 * Client registration result
 */
export interface OAuthClientRegistrationResult {
  success: boolean;
  clientId?: string;
  clientSecret?: string;
  error?: string;
}
