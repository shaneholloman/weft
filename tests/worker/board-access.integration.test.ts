/**
 * Board Access Control Integration Tests
 *
 * Proves that:
 * - Users cannot access boards they don't own (403)
 * - Users can access their own boards (200)
 */

import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import '../../worker/index';

describe('Board Access Control', () => {
  it('returns 403 when accessing board user does not own', async () => {
    const res = await SELF.fetch('http://localhost/api/boards/nonexistent-board-id');
    expect(res.status).toBe(403);
  });

  it('returns 200 when accessing own board', async () => {
    // Create a board first (adds to user's list)
    const createRes = await SELF.fetch('http://localhost/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Board' }),
    });
    expect(createRes.status).toBe(200);

    const { data } = (await createRes.json()) as { data: { id: string } };

    // Access it
    const res = await SELF.fetch(`http://localhost/api/boards/${data.id}`);
    expect(res.status).toBe(200);
  });
});
