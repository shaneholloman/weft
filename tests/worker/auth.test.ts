/**
 * Auth Layer Security Tests
 *
 * Proves that:
 * - AUTH_MODE=access requires valid JWT
 * - AUTH_MODE=none returns singleton user without auth
 * - Invalid JWTs are rejected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthenticatedUser, type AuthEnv } from '../../worker/auth';

// Mock jose module
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from 'jose';

describe('getAuthenticatedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AUTH_MODE=access (Cloudflare Access)', () => {
    const accessEnv: AuthEnv = {
      AUTH_MODE: 'access',
      ACCESS_AUD: 'production-aud-123',
      ACCESS_TEAM: 'myteam',
    };

    it('rejects requests without JWT header', async () => {
      const request = new Request('https://example.com/api/boards');

      const user = await getAuthenticatedUser(request, accessEnv);

      expect(user).toBeNull();
    });

    it('rejects requests with invalid JWT', async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Invalid signature'));

      const request = new Request('https://example.com/api/boards', {
        headers: { 'CF-Access-JWT-Assertion': 'invalid-jwt-token' },
      });

      const user = await getAuthenticatedUser(request, accessEnv);

      expect(user).toBeNull();
    });

    it('rejects JWT with wrong audience', async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Audience mismatch'));

      const request = new Request('https://example.com/api/boards', {
        headers: { 'CF-Access-JWT-Assertion': 'jwt-wrong-audience' },
      });

      const user = await getAuthenticatedUser(request, accessEnv);

      expect(user).toBeNull();
    });

    it('accepts valid JWT and extracts user info', async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          email: 'user@example.com',
        },
        protectedHeader: { alg: 'RS256' },
        key: {},
      } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

      const request = new Request('https://example.com/api/boards', {
        headers: { 'CF-Access-JWT-Assertion': 'valid-jwt-token' },
      });

      const user = await getAuthenticatedUser(request, accessEnv);

      expect(user).toEqual({
        id: 'user-123',
        email: 'user@example.com',
      });
    });

    it('rejects JWT missing sub claim', async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          email: 'user@example.com',
        },
        protectedHeader: { alg: 'RS256' },
        key: {},
      } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

      const request = new Request('https://example.com/api/boards', {
        headers: { 'CF-Access-JWT-Assertion': 'jwt-no-sub' },
      });

      const user = await getAuthenticatedUser(request, accessEnv);

      expect(user).toBeNull();
    });

    it('rejects JWT missing email claim', async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
        },
        protectedHeader: { alg: 'RS256' },
        key: {},
      } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

      const request = new Request('https://example.com/api/boards', {
        headers: { 'CF-Access-JWT-Assertion': 'jwt-no-email' },
      });

      const user = await getAuthenticatedUser(request, accessEnv);

      expect(user).toBeNull();
    });

    it('CRITICAL: ignores USER_ID/USER_EMAIL in access mode', async () => {
      // Even if USER_ID is set, access mode must require JWT
      const envWithUser: AuthEnv = {
        AUTH_MODE: 'access',
        ACCESS_AUD: 'production-aud-123',
        ACCESS_TEAM: 'myteam',
        USER_ID: 'should-be-ignored',
        USER_EMAIL: 'ignored@example.com',
      };

      const request = new Request('https://example.com/api/boards');

      const user = await getAuthenticatedUser(request, envWithUser);

      expect(user).toBeNull();
    });
  });

  describe('AUTH_MODE=none (singleton user)', () => {
    const noneEnv: AuthEnv = {
      AUTH_MODE: 'none',
      USER_ID: 'singleton-user',
      USER_EMAIL: 'user@localhost',
    };

    it('returns singleton user without any auth', async () => {
      const request = new Request('https://example.com/api/boards');

      const user = await getAuthenticatedUser(request, noneEnv);

      expect(user).toEqual({
        id: 'singleton-user',
        email: 'user@localhost',
      });
    });

    it('uses default values when USER_ID/USER_EMAIL not set', async () => {
      const minimalEnv: AuthEnv = {
        AUTH_MODE: 'none',
      };

      const request = new Request('https://example.com/api/boards');

      const user = await getAuthenticatedUser(request, minimalEnv);

      expect(user).toEqual({
        id: 'user',
        email: 'user@localhost',
      });
    });

    it('ignores JWT header in none mode', async () => {
      // JWT should be ignored - we don't even try to verify it
      const request = new Request('https://example.com/api/boards', {
        headers: { 'CF-Access-JWT-Assertion': 'some-jwt-token' },
      });

      const user = await getAuthenticatedUser(request, noneEnv);

      // Should return singleton user, not attempt JWT verification
      expect(user).toEqual({
        id: 'singleton-user',
        email: 'user@localhost',
      });
      expect(jwtVerify).not.toHaveBeenCalled();
    });
  });
});
