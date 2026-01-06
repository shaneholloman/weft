/**
 * GmailMCP - Hosted MCP wrapper for Gmail API
 *
 * Provides MCP-compatible tools for Gmail operations:
 * - listMessages: List recent emails
 * - getMessage: Get full email content
 * - sendEmail: Send an email
 * - searchMessages: Search emails with query
 * - getThread: Get full email thread
 * - getAuthenticatedUser: Get authenticated user info
 */

import { HostedMCPServer, type MCPToolSchema, type MCPToolCallResult } from '../mcp/MCPClient';
import { toolsToMCPSchemas, parseToolArgs } from '../utils/zodTools';
import { gmailTools } from './gmailTools';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const DEFAULT_MAX_RESULTS = 10;

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
    }>;
  };
  labelIds?: string[];
  internalDate?: string;
}

export interface GmailThread {
  id: string;
  snippet: string;
  messages: GmailMessage[];
}

export class GmailMCPServer extends HostedMCPServer {
  readonly name = 'Gmail';
  readonly description = 'Gmail API for reading, sending, and searching emails';

  private accessToken: string;

  constructor(accessToken: string) {
    super();
    this.accessToken = accessToken;
  }

  getTools(): MCPToolSchema[] {
    return toolsToMCPSchemas(gmailTools);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    try {
      switch (name) {
        case 'listMessages':
          return await this.listMessages(args);
        case 'getMessage':
          return await this.getMessage(args);
        case 'sendEmail':
          return await this.sendEmail(args);
        case 'searchMessages':
          return await this.searchMessages(args);
        case 'getThread':
          return await this.getThread(args);
        case 'getAuthenticatedUser':
          return await this.getAuthenticatedUser();
        default:
          return this.errorContent(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return this.errorContent(error instanceof Error ? error.message : String(error));
    }
  }

  private async listMessages(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { maxResults = DEFAULT_MAX_RESULTS, query, labelIds } = parseToolArgs(
      gmailTools.listMessages.input,
      args
    );

    const params = new URLSearchParams({
      maxResults: String(Math.min(maxResults, 100)),
    });
    if (query) params.set('q', query);
    if (labelIds) params.set('labelIds', labelIds.join(','));

    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data = await response.json() as { messages?: Array<{ id: string; threadId: string }> };
    const messages = data.messages || [];

    // Fetch snippets for each message
    const messageDetails = await Promise.all(
      messages.slice(0, 20).map(async (msg) => {
        const detailResponse = await fetch(
          `${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
            },
          }
        );
        if (!detailResponse.ok) return null;
        return detailResponse.json() as Promise<GmailMessage>;
      })
    );

    const results = messageDetails
      .filter((m): m is GmailMessage => m !== null)
      .map((msg) => {
        const headers = msg.payload?.headers || [];
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: headers.find((h) => h.name === 'From')?.value || 'Unknown',
          subject: headers.find((h) => h.name === 'Subject')?.value || '(no subject)',
          date: headers.find((h) => h.name === 'Date')?.value || '',
          snippet: msg.snippet,
        };
      });

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      structuredContent: results,
    };
  }

  private async getMessage(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { messageId } = parseToolArgs(gmailTools.getMessage.input, args);

    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const message = await response.json() as GmailMessage;
    const headers = message.payload?.headers || [];

    // Extract body content
    let body = '';
    if (message.payload?.body?.data) {
      body = this.decodeBase64Url(message.payload.body.data);
    } else if (message.payload?.parts) {
      const textPart = message.payload.parts.find(
        (p) => p.mimeType === 'text/plain'
      );
      if (textPart?.body?.data) {
        body = this.decodeBase64Url(textPart.body.data);
      }
    }

    const result = {
      id: message.id,
      threadId: message.threadId,
      from: headers.find((h) => h.name === 'From')?.value || 'Unknown',
      to: headers.find((h) => h.name === 'To')?.value || '',
      subject: headers.find((h) => h.name === 'Subject')?.value || '(no subject)',
      date: headers.find((h) => h.name === 'Date')?.value || '',
      body,
      labels: message.labelIds || [],
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  private async sendEmail(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { to, subject, body, cc, bcc } = parseToolArgs(gmailTools.sendEmail.input, args);

    // Build RFC 2822 formatted email
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
    ];
    if (cc) lines.push(`Cc: ${cc}`);
    if (bcc) lines.push(`Bcc: ${bcc}`);
    lines.push('', body);

    const rawMessage = lines.join('\r\n');
    const encodedMessage = this.encodeBase64Url(rawMessage);

    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedMessage }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as { id: string; threadId: string };

    return {
      content: [{ type: 'text', text: `Email sent successfully. Message ID: ${result.id}` }],
      structuredContent: {
        success: true,
        messageId: result.id,
        threadId: result.threadId,
        title: `Email to ${to}`,
        // Inline artifact content (no external URL needed)
        content: {
          to,
          cc,
          bcc,
          subject,
          body,
          sentAt: new Date().toISOString(),
        },
      },
    };
  }

  private async searchMessages(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { query, maxResults = DEFAULT_MAX_RESULTS } = parseToolArgs(
      gmailTools.searchMessages.input,
      args
    );
    return this.listMessages({ query, maxResults });
  }

  private async getThread(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { threadId } = parseToolArgs(gmailTools.getThread.input, args);

    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/threads/${threadId}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const thread = await response.json() as GmailThread;

    const messages = thread.messages.map((msg) => {
      const headers = msg.payload?.headers || [];
      let body = '';
      if (msg.payload?.body?.data) {
        body = this.decodeBase64Url(msg.payload.body.data);
      } else if (msg.payload?.parts) {
        const textPart = msg.payload.parts.find((p) => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = this.decodeBase64Url(textPart.body.data);
        }
      }

      return {
        id: msg.id,
        from: headers.find((h) => h.name === 'From')?.value || 'Unknown',
        to: headers.find((h) => h.name === 'To')?.value || '',
        subject: headers.find((h) => h.name === 'Subject')?.value || '(no subject)',
        date: headers.find((h) => h.name === 'Date')?.value || '',
        body,
      };
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }],
      structuredContent: { threadId: thread.id, messages },
    };
  }

  private async getAuthenticatedUser(): Promise<MCPToolCallResult> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    const userInfo = await response.json() as { email: string; name: string; picture?: string };

    return {
      content: [{ type: 'text', text: JSON.stringify(userInfo, null, 2) }],
      structuredContent: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    };
  }

  private decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  private encodeBase64Url(str: string): string {
    const bytes = new TextEncoder().encode(str);
    const binary = String.fromCharCode(...bytes);
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
