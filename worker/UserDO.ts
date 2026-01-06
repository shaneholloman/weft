/**
 * UserDO - Durable Object for user data
 *
 * Keyed by user ID (from Cloudflare Access JWT `sub` claim)
 * Stores: user info, list of boards user has access to
 *
 * Uses RPC for all operations (no HTTP routing needed)
 */

import { DurableObject } from 'cloudflare:workers';

// Response types for RPC methods
export interface UserInfo {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserBoard {
  id: string;
  boardId: string;
  name: string;
  role: string;
  createdAt: string;
  addedAt: string;
}

export interface AccessResult {
  hasAccess: boolean;
  role?: string;
}

export class UserDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.initSchema();
  }

  private initSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS user_info (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_boards (
        board_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        added_at TEXT NOT NULL
      );
    `);
  }

  // ============================================
  // RPC METHODS (called directly from worker)
  // ============================================

  /**
   * Initialize or update user info
   */
  async initUser(id: string, email: string): Promise<{ success: boolean }> {
    const now = new Date().toISOString();

    const existing = this.sql.exec(
      'SELECT id, email FROM user_info WHERE id = ?',
      id
    ).toArray()[0] as { id: string; email: string } | undefined;

    if (existing) {
      if (existing.email !== email) {
        this.sql.exec(
          'UPDATE user_info SET email = ?, updated_at = ? WHERE id = ?',
          email,
          now,
          id
        );
      }
    } else {
      this.sql.exec(
        'INSERT INTO user_info (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)',
        id,
        email,
        now,
        now
      );
    }

    return { success: true };
  }

  /**
   * Get user info
   */
  async getUserInfo(): Promise<UserInfo | null> {
    const user = this.sql.exec(
      'SELECT id, email, created_at, updated_at FROM user_info'
    ).toArray()[0] as { id: string; email: string; created_at: string; updated_at: string } | undefined;

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  /**
   * Get user's boards
   */
  async getBoards(): Promise<UserBoard[]> {
    const boards = this.sql.exec(
      'SELECT board_id, name, role, added_at FROM user_boards ORDER BY added_at DESC'
    ).toArray() as Array<{ board_id: string; name: string; role: string; added_at: string }>;

    return boards.map((b) => ({
      id: b.board_id,
      boardId: b.board_id,
      name: b.name,
      role: b.role,
      createdAt: b.added_at,
      addedAt: b.added_at,
    }));
  }

  /**
   * Add a board to user's list
   */
  async addBoard(boardId: string, name: string, role?: string): Promise<{ success: boolean }> {
    const now = new Date().toISOString();

    const existing = this.sql.exec(
      'SELECT board_id FROM user_boards WHERE board_id = ?',
      boardId
    ).toArray()[0];

    if (existing) {
      return { success: true }; // Already exists
    }

    this.sql.exec(
      'INSERT INTO user_boards (board_id, name, role, added_at) VALUES (?, ?, ?, ?)',
      boardId,
      name,
      role || 'owner',
      now
    );

    return { success: true };
  }

  /**
   * Check if user has access to a board
   */
  async hasAccess(boardId: string): Promise<AccessResult> {
    const board = this.sql.exec(
      'SELECT board_id, role FROM user_boards WHERE board_id = ?',
      boardId
    ).toArray()[0] as { board_id: string; role: string } | undefined;

    if (!board) {
      return { hasAccess: false };
    }

    return { hasAccess: true, role: board.role };
  }

  /**
   * Update board name in user's list
   */
  async updateBoardName(boardId: string, name: string): Promise<{ success: boolean }> {
    this.sql.exec(
      'UPDATE user_boards SET name = ? WHERE board_id = ?',
      name,
      boardId
    );
    return { success: true };
  }

  /**
   * Remove a board from user's list
   */
  async removeBoard(boardId: string): Promise<{ success: boolean }> {
    this.sql.exec('DELETE FROM user_boards WHERE board_id = ?', boardId);
    return { success: true };
  }
}
