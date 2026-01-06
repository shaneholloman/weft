import { encryptValue, decryptValue } from '../utils/crypto';
import { jsonResponse } from '../utils/response';
import { toCamelCase } from '../utils/transformations';

export class CredentialService {
  private sql: SqlStorage;
  private encryptionKey: string;
  private generateId: () => string;

  constructor(
    sql: SqlStorage,
    encryptionKey: string,
    generateId: () => string
  ) {
    this.sql = sql;
    this.encryptionKey = encryptionKey;
    this.generateId = generateId;
  }

  /**
   * Get all credentials for a board (without encrypted values)
   */
  getCredentials(boardId: string): Response {
    const credentials = this.sql.exec(
      'SELECT id, board_id, type, name, metadata, created_at, updated_at FROM board_credentials WHERE board_id = ?',
      boardId
    ).toArray();

    return jsonResponse({
      success: true,
      data: credentials.map(c => {
        const cred = toCamelCase(c as Record<string, unknown>);
        if (typeof cred.metadata === 'string' && cred.metadata) {
          try {
            cred.metadata = JSON.parse(cred.metadata);
          } catch {
            // Leave as string if parsing fails
          }
        }
        return cred;
      })
    });
  }

  /**
   * Create a new credential with encrypted value
   */
  async createCredential(boardId: string, data: {
    type: string;
    name: string;
    value: string;
    metadata?: object;
  }): Promise<Response> {
    const id = this.generateId();
    const now = new Date().toISOString();
    const encryptedValue = await this.encrypt(data.value);

    this.sql.exec(
      `INSERT INTO board_credentials (id, board_id, type, name, encrypted_value, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      boardId,
      data.type,
      data.name,
      encryptedValue,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    );

    return jsonResponse({
      success: true,
      data: {
        id,
        boardId,
        type: data.type,
        name: data.name,
        createdAt: now,
        updatedAt: now
      }
    });
  }

  /**
   * Delete a credential and cascade to associated MCP servers
   */
  deleteCredential(boardId: string, credentialId: string): Response {
    // Cascade delete associated MCP servers and their tools
    this.sql.exec(
      `DELETE FROM mcp_tool_schemas WHERE server_id IN (
        SELECT id FROM mcp_servers WHERE credential_id = ?
      )`,
      credentialId
    );
    this.sql.exec(
      'DELETE FROM mcp_servers WHERE credential_id = ?',
      credentialId
    );
    this.sql.exec(
      'DELETE FROM board_credentials WHERE id = ? AND board_id = ?',
      credentialId,
      boardId
    );

    return jsonResponse({ success: true });
  }

  /**
   * Get decrypted credential value by type
   */
  async getCredentialValue(boardId: string, type: string): Promise<string | null> {
    const credential = this.sql.exec(
      'SELECT encrypted_value FROM board_credentials WHERE board_id = ? AND type = ?',
      boardId,
      type
    ).toArray()[0] as { encrypted_value: string } | undefined;

    if (!credential) return null;
    return this.decrypt(credential.encrypted_value);
  }

  /**
   * HTTP handler for getting credential value
   */
  async getCredentialValueResponse(boardId: string, type: string): Promise<Response> {
    const value = await this.getCredentialValue(boardId, type);
    if (!value) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: `Credential ${type} not found` }
      }, 404);
    }
    return jsonResponse({ success: true, data: { value } });
  }

  /**
   * Get credential by ID with decrypted value and metadata
   */
  async getCredentialById(boardId: string, credentialId: string): Promise<Response> {
    const credential = this.sql.exec(
      'SELECT encrypted_value, metadata FROM board_credentials WHERE board_id = ? AND id = ?',
      boardId,
      credentialId
    ).toArray()[0] as { encrypted_value: string; metadata: string | null } | undefined;

    if (!credential) {
      return jsonResponse({ success: false, error: 'Credential not found' }, 404);
    }

    return jsonResponse({
      success: true,
      data: {
        value: await this.decrypt(credential.encrypted_value),
        metadata: credential.metadata ? JSON.parse(credential.metadata) : null,
      }
    });
  }

  /**
   * Get full credential by type with decrypted value and metadata
   */
  async getCredentialFullResponse(boardId: string, type: string): Promise<Response> {
    const credential = this.sql.exec(
      'SELECT encrypted_value, metadata FROM board_credentials WHERE board_id = ? AND type = ?',
      boardId,
      type
    ).toArray()[0] as { encrypted_value: string; metadata: string | null } | undefined;

    if (!credential) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: `Credential ${type} not found` }
      }, 404);
    }

    return jsonResponse({
      success: true,
      data: {
        value: await this.decrypt(credential.encrypted_value),
        metadata: credential.metadata ? JSON.parse(credential.metadata) : {},
      }
    });
  }

  /**
   * Update credential value (for token refresh)
   */
  async updateCredentialValue(
    boardId: string,
    type: string,
    newValue: string,
    metadataUpdates?: Record<string, unknown>
  ): Promise<Response> {
    const encryptedValue = await this.encrypt(newValue);
    const now = new Date().toISOString();

    if (metadataUpdates) {
      const existing = this.sql.exec(
        'SELECT metadata FROM board_credentials WHERE board_id = ? AND type = ?',
        boardId,
        type
      ).toArray()[0] as { metadata: string | null } | undefined;

      const existingMetadata = existing?.metadata ? JSON.parse(existing.metadata) : {};
      const mergedMetadata = { ...existingMetadata, ...metadataUpdates };

      this.sql.exec(
        'UPDATE board_credentials SET encrypted_value = ?, metadata = ?, updated_at = ? WHERE board_id = ? AND type = ?',
        encryptedValue,
        JSON.stringify(mergedMetadata),
        now,
        boardId,
        type
      );
    } else {
      this.sql.exec(
        'UPDATE board_credentials SET encrypted_value = ?, updated_at = ? WHERE board_id = ? AND type = ?',
        encryptedValue,
        now,
        boardId,
        type
      );
    }

    return jsonResponse({ success: true });
  }

  /**
   * Get raw credential row by ID (for internal use)
   */
  getCredentialRowById(credentialId: string): { encrypted_value: string; metadata?: string } | undefined {
    return this.sql.exec(
      'SELECT encrypted_value, metadata FROM board_credentials WHERE id = ?',
      credentialId
    ).toArray()[0] as { encrypted_value: string; metadata?: string } | undefined;
  }

  /**
   * Find credential ID by board and type
   */
  findCredentialId(boardId: string, type: string): string | undefined {
    const row = this.sql.exec(
      'SELECT id FROM board_credentials WHERE board_id = ? AND type = ?',
      boardId,
      type
    ).toArray()[0] as { id: string } | undefined;
    return row?.id;
  }

  /**
   * Encrypt a value
   */
  async encrypt(value: string): Promise<string> {
    return encryptValue(value, this.encryptionKey);
  }

  /**
   * Decrypt a value
   */
  async decrypt(encrypted: string): Promise<string> {
    return decryptValue(encrypted, this.encryptionKey);
  }
}
