/**
 * Authentication utilities
 *
 * AUTH_MODE controls authentication:
 * - 'access': Cloudflare Access JWT verification (multi-user)
 * - 'none': No auth, singleton user (self-hosted single-user deployments)
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { logger } from './utils/logger';

export interface AuthUser {
  id: string;
  email: string;
}

interface AccessJWTPayload extends JWTPayload {
  email?: string;
  sub?: string;
}

// Extended Env type for auth (adds to auto-generated Env)
export interface AuthEnv {
  AUTH_MODE: 'access' | 'none';
  ACCESS_AUD?: string;
  ACCESS_TEAM?: string;
  USER_ID?: string;
  USER_EMAIL?: string;
}

// Cache JWKS for performance
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(teamName: string) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(
      new URL(`https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`)
    );
  }
  return jwksCache;
}

/**
 * Verify Cloudflare Access JWT and extract user info
 */
async function verifyAccessJWT(
  jwt: string,
  env: AuthEnv
): Promise<AuthUser | null> {
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM) {
    logger.auth.error('ACCESS_AUD or ACCESS_TEAM not configured');
    return null;
  }

  try {
    const jwks = getJWKS(env.ACCESS_TEAM);
    const { payload } = await jwtVerify(jwt, jwks, {
      audience: env.ACCESS_AUD,
    });

    const accessPayload = payload as AccessJWTPayload;

    if (!accessPayload.sub || !accessPayload.email) {
      logger.auth.error('JWT missing sub or email claim');
      return null;
    }

    return {
      id: accessPayload.sub,
      email: accessPayload.email,
    };
  } catch (error) {
    logger.auth.error('JWT verification failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Get authenticated user from request
 *
 * AUTH_MODE determines behavior:
 * - 'access': Verify Cloudflare Access JWT, multi-user
 * - 'none': Return singleton user, no auth required
 */
export async function getAuthenticatedUser(
  request: Request,
  env: AuthEnv
): Promise<AuthUser | null> {
  if (env.AUTH_MODE === 'none') {
    // Singleton user mode - no auth required
    return {
      id: env.USER_ID || 'user',
      email: env.USER_EMAIL || 'user@localhost',
    };
  }

  // AUTH_MODE === 'access' - require Cloudflare Access JWT
  const jwt = request.headers.get('CF-Access-JWT-Assertion');
  if (!jwt) {
    logger.auth.warn('No JWT provided in access mode');
    return null;
  }

  return await verifyAccessJWT(jwt, env);
}

/**
 * Get the Cloudflare Access logout URL
 */
export function getLogoutUrl(teamName: string): string {
  return `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/logout`;
}
