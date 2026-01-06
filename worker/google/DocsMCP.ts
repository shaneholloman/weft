/**
 * DocsMCP - Hosted MCP wrapper for Google Docs API
 *
 * Provides MCP-compatible tools for Google Docs operations:
 * - getDocument: Read a document's content
 * - listDocuments: List recent documents from Drive
 * - createDocument: Create a new document
 * - appendToDocument: Append content to a document
 * - searchDocuments: Search for documents
 * - replaceDocumentContent: Replace document content
 */

import { HostedMCPServer, type MCPToolSchema, type MCPToolCallResult } from '../mcp/MCPClient';
import { toolsToMCPSchemas, parseToolArgs } from '../utils/zodTools';
import { docsTools } from './docsTools';
import { markdownToDocsRequests } from './markdownToDocs';

const DOCS_API_BASE = 'https://docs.googleapis.com/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DEFAULT_MAX_RESULTS = 10;

export interface GoogleDoc {
  documentId: string;
  title: string;
  body?: {
    content: Array<{
      paragraph?: {
        elements: Array<{
          textRun?: {
            content: string;
          };
        }>;
      };
    }>;
  };
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

export class DocsMCPServer extends HostedMCPServer {
  readonly name = 'Google Docs';
  readonly description = 'Google Docs API for reading, creating, and editing documents';

  private accessToken: string;

  constructor(accessToken: string) {
    super();
    this.accessToken = accessToken;
  }

  getTools(): MCPToolSchema[] {
    return toolsToMCPSchemas(docsTools);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    try {
      switch (name) {
        case 'getDocument':
          return await this.getDocument(args);
        case 'listDocuments':
          return await this.listDocuments(args);
        case 'createDocument':
          return await this.createDocument(args);
        case 'appendToDocument':
          return await this.appendToDocument(args);
        case 'searchDocuments':
          return await this.searchDocuments(args);
        case 'replaceDocumentContent':
          return await this.replaceDocumentContent(args);
        default:
          return this.errorContent(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return this.errorContent(error instanceof Error ? error.message : String(error));
    }
  }

  private async getDocument(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { documentId } = parseToolArgs(docsTools.getDocument.input, args);

    const response = await fetch(
      `${DOCS_API_BASE}/documents/${documentId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Docs API error: ${response.status}`);
    }

    const doc = await response.json() as GoogleDoc;

    // Extract plain text from document structure
    const textContent = this.extractTextFromDoc(doc);

    const result = {
      documentId: doc.documentId,
      title: doc.title,
      content: textContent,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  private async listDocuments(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { maxResults = DEFAULT_MAX_RESULTS, query } = parseToolArgs(docsTools.listDocuments.input, args);

    // Build Drive API query for Google Docs
    // Escape special characters for Google Drive query syntax
    let driveQuery = "mimeType='application/vnd.google-apps.document'";
    if (query) {
      // Escape backslashes first, then single quotes
      const escapedQuery = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      driveQuery += ` and name contains '${escapedQuery}'`;
    }

    const params = new URLSearchParams({
      q: driveQuery,
      pageSize: String(Math.min(maxResults, 100)),
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
      orderBy: 'modifiedTime desc',
    });

    const response = await fetch(
      `${DRIVE_API_BASE}/files?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status}`);
    }

    const data = await response.json() as { files: DriveFile[] };

    const results = data.files.map((file) => ({
      documentId: file.id,
      title: file.name,
      modifiedTime: file.modifiedTime,
      url: file.webViewLink,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      structuredContent: results,
    };
  }

  private async createDocument(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { title, content } = parseToolArgs(docsTools.createDocument.input, args);

    // Create the document
    const createResponse = await fetch(
      `${DOCS_API_BASE}/documents`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Google Docs API error: ${createResponse.status} - ${error}`);
    }

    const doc = await createResponse.json() as GoogleDoc;

    // If content provided, insert it with formatting
    if (content) {
      await this.insertFormattedText(doc.documentId, content, 1);
    }

    const result = {
      documentId: doc.documentId,
      title: doc.title,
      url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
    };

    return {
      content: [{ type: 'text', text: `Document created successfully: ${result.url}` }],
      structuredContent: result,
    };
  }

  private async appendToDocument(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { documentId, content } = parseToolArgs(docsTools.appendToDocument.input, args);

    // Get document to find end index
    const docResponse = await fetch(
      `${DOCS_API_BASE}/documents/${documentId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!docResponse.ok) {
      throw new Error(`Google Docs API error: ${docResponse.status}`);
    }

    const doc = await docResponse.json() as GoogleDoc & { body: { content: Array<{ endIndex: number }> } };
    const endIndex = doc.body.content[doc.body.content.length - 1]?.endIndex || 1;

    // Insert formatted text at end (with leading newline)
    await this.insertFormattedText(documentId, '\n' + content, endIndex - 1);

    const result = {
      success: true,
      documentId,
      title: doc.title,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };

    return {
      content: [{ type: 'text', text: `Content appended to "${doc.title}" successfully: ${result.url}` }],
      structuredContent: result,
    };
  }

  private async searchDocuments(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { query, maxResults = DEFAULT_MAX_RESULTS } = parseToolArgs(docsTools.searchDocuments.input, args);
    return this.listDocuments({ query, maxResults });
  }

  private async replaceDocumentContent(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { documentId, content } = parseToolArgs(docsTools.replaceDocumentContent.input, args);

    // Get document to find content range
    const docResponse = await fetch(
      `${DOCS_API_BASE}/documents/${documentId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!docResponse.ok) {
      throw new Error(`Google Docs API error: ${docResponse.status}`);
    }

    const doc = await docResponse.json() as GoogleDoc & { body: { content: Array<{ endIndex: number }> } };
    const endIndex = doc.body.content[doc.body.content.length - 1]?.endIndex || 1;

    // Delete existing content (index 1 to endIndex-1, preserving the trailing newline structure)
    if (endIndex > 2) {
      const deleteResponse = await fetch(
        `${DOCS_API_BASE}/documents/${documentId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{
              deleteContentRange: {
                range: {
                  startIndex: 1,
                  endIndex: endIndex - 1,
                },
              },
            }],
          }),
        }
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.text();
        throw new Error(`Google Docs API error: ${deleteResponse.status} - ${error}`);
      }
    }

    // Insert new formatted content at the beginning
    if (content) {
      await this.insertFormattedText(documentId, content, 1);
    }

    const result = {
      success: true,
      documentId,
      title: doc.title,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };

    return {
      content: [{ type: 'text', text: `Document "${doc.title}" updated successfully: ${result.url}` }],
      structuredContent: result,
    };
  }

  /**
   * Insert text with markdown formatting converted to Google Docs styles
   */
  private async insertFormattedText(documentId: string, markdown: string, startIndex: number): Promise<void> {
    const requests = markdownToDocsRequests(markdown, startIndex);

    if (requests.length === 0) {
      return;
    }

    const response = await fetch(
      `${DOCS_API_BASE}/documents/${documentId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to insert formatted text: ${response.status} - ${error}`);
    }
  }

  private extractTextFromDoc(doc: GoogleDoc): string {
    if (!doc.body?.content) return '';

    const textParts: string[] = [];

    for (const element of doc.body.content) {
      if (element.paragraph?.elements) {
        for (const elem of element.paragraph.elements) {
          if (elem.textRun?.content) {
            textParts.push(elem.textRun.content);
          }
        }
      }
    }

    return textParts.join('');
  }
}
