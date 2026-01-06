/**
 * PKCE (Proof Key for Code Exchange) utilities for MCP OAuth
 *
 * Implements RFC 7636 for secure OAuth authorization code flow.
 */

/**
 * Generate a cryptographically random code verifier
 * Must be 43-128 characters, using unreserved URI characters
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(96); // Will produce 128 base64url chars
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate code challenge from verifier using SHA-256
 * code_challenge = BASE64URL(SHA256(code_verifier))
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a secure random state parameter for CSRF protection
 * Encodes boardId, serverId, and a random nonce
 */
export function generateState(boardId: string, serverId: string): string {
  const nonce = generateNonce();
  const stateData = {
    boardId,
    serverId,
    nonce,
    timestamp: Date.now(),
  };
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(stateData)));
}

/**
 * Parse and validate state parameter
 * Returns null if invalid or tampered
 */
export function parseState(state: string): { boardId: string; serverId: string; nonce: string; timestamp: number } | null {
  try {
    const decoded = base64UrlDecode(state);
    const text = new TextDecoder().decode(decoded);
    const data = JSON.parse(text);

    if (!data.boardId || !data.serverId || !data.nonce || !data.timestamp) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Generate a random nonce for state parameter
 */
function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Base64 URL encode (RFC 4648 Section 5)
 * - No padding
 * - URL-safe characters (+ -> -, / -> _)
 */
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
