/**
 * Gmail MCP Tool Definitions
 *
 * Single source of truth for Gmail tool schemas using Zod.
 * Used for both JSON Schema generation (getTools) and runtime validation (callTool).
 */

import { z } from 'zod';
import { defineTools, commonSchemas } from '../utils/zodTools';

// ============================================================================
// Gmail-specific Schema Components
// ============================================================================

const gmailLabelIds = z.array(z.string())
  .describe('Filter by label IDs (e.g., ["INBOX", "UNREAD"])');

// ============================================================================
// Output Schemas
// ============================================================================

const messageListItemOutput = z.object({
  id: z.string().describe('Message ID'),
  threadId: z.string().describe('Thread ID'),
  from: z.string().describe('Sender email/name'),
  subject: z.string().describe('Email subject'),
  date: z.string().describe('Email date'),
  snippet: z.string().describe('Preview text'),
});

const messageDetailOutput = z.object({
  id: z.string().describe('Message ID'),
  threadId: z.string().describe('Thread ID'),
  from: z.string().describe('Sender email/name'),
  to: z.string().describe('Recipient email'),
  subject: z.string().describe('Email subject'),
  date: z.string().describe('Email date'),
  body: z.string().describe('Email body content'),
  labels: z.array(z.string()).describe('Gmail labels'),
});

const sendEmailOutput = z.object({
  success: z.boolean().describe('Whether email was sent'),
  messageId: z.string().describe('Sent message ID'),
  threadId: z.string().describe('Thread ID'),
});

const threadOutput = z.object({
  threadId: z.string().describe('Thread ID'),
  messages: z.array(z.object({
    id: z.string().describe('Message ID'),
    from: z.string().describe('Sender email/name'),
    to: z.string().describe('Recipient email'),
    subject: z.string().describe('Email subject'),
    date: z.string().describe('Email date'),
    body: z.string().describe('Email body content'),
  })).describe('Messages in the thread'),
});

const userInfoOutput = z.object({
  email: z.string().describe('User email address'),
  name: z.string().describe('User display name'),
  picture: z.string().optional().describe('Profile picture URL'),
});

// ============================================================================
// Tool Definitions
// ============================================================================

export const gmailTools = defineTools({
  listMessages: {
    description: 'List recent email messages from Gmail inbox',
    input: z.object({
      maxResults: z.coerce.number().int().min(1).max(100).default(10)
        .describe('Maximum number of messages to return (default 10, max 100)'),
      query: z.string().max(500).optional()
        .describe('Gmail search query (e.g., "from:user@example.com", "is:unread")'),
      labelIds: gmailLabelIds.optional(),
    }),
    output: z.array(messageListItemOutput)
      .describe('Array of email message summaries'),
  },

  getMessage: {
    description: 'Get the full content of a specific email message',
    input: z.object({
      messageId: commonSchemas.messageId,
    }),
    output: messageDetailOutput,
  },

  sendEmail: {
    description: 'Send an email message',
    input: z.object({
      to: commonSchemas.email.describe('Recipient email address'),
      subject: z.string().max(500).describe('Email subject line'),
      body: z.string().max(50000).describe('Email body content (plain text)'),
      cc: z.string().email().optional().describe('CC recipients (comma-separated)'),
      bcc: z.string().email().optional().describe('BCC recipients (comma-separated)'),
    }),
    output: sendEmailOutput,
    approvalRequiredFields: ['to', 'subject', 'body'],
  },

  searchMessages: {
    description: 'Search for emails using Gmail query syntax',
    input: z.object({
      query: z.string().max(500).describe('Gmail search query (e.g., "subject:meeting after:2024/01/01")'),
      maxResults: z.coerce.number().int().min(1).max(100).default(10)
        .describe('Maximum number of results (default 10)'),
    }),
    output: z.array(messageListItemOutput)
      .describe('Array of matching email summaries'),
  },

  getThread: {
    description: 'Get a full email thread/conversation',
    input: z.object({
      threadId: commonSchemas.threadId,
    }),
    output: threadOutput,
  },

  getAuthenticatedUser: {
    description: 'Get the email address and profile of the authenticated Gmail user',
    input: z.object({}),
    output: userInfoOutput,
  },
});

// Export individual schemas for direct access if needed
export type GmailToolName = keyof typeof gmailTools;
