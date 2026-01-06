/**
 * Google Docs MCP Tool Definitions
 *
 * Single source of truth for Google Docs tool schemas using Zod.
 * Used for both JSON Schema generation (getTools) and runtime validation (callTool).
 */

import { z } from 'zod';
import { defineTools, commonSchemas } from '../utils/zodTools';

// ============================================================================
// Output Schemas
// ============================================================================

const documentDetailOutput = z.object({
  documentId: z.string().describe('Document ID'),
  title: z.string().describe('Document title'),
  content: z.string().describe('Document text content'),
});

const documentListItemOutput = z.object({
  documentId: z.string().describe('Document ID'),
  title: z.string().describe('Document title'),
  modifiedTime: z.string().optional().describe('Last modified timestamp'),
  url: z.string().optional().describe('URL to view/edit document'),
});

const createDocumentOutput = z.object({
  documentId: z.string().describe('Created document ID'),
  title: z.string().describe('Document title'),
  url: z.string().describe('URL to view/edit document'),
});

const updateDocumentOutput = z.object({
  success: z.boolean().describe('Whether update succeeded'),
  documentId: z.string().describe('Document ID'),
  url: z.string().optional().describe('URL to view/edit document'),
});

// ============================================================================
// Tool Definitions
// ============================================================================

export const docsTools = defineTools({
  getDocument: {
    description: 'Get the full content of a Google Doc',
    input: z.object({
      documentId: commonSchemas.documentId.describe('The ID of the Google Doc (from the URL)'),
    }),
    output: documentDetailOutput,
  },

  listDocuments: {
    description: 'List recent Google Docs from Drive',
    input: z.object({
      maxResults: z.coerce.number().int().min(1).max(100).default(10)
        .describe('Maximum number of documents to return (default 10)'),
      query: z.string().max(500).optional()
        .describe('Search query for document names'),
    }),
    output: z.array(documentListItemOutput).describe('Array of document summaries'),
  },

  createDocument: {
    description: 'Create a new Google Doc',
    input: z.object({
      title: commonSchemas.title.describe('Title of the new document'),
      content: z.string().max(100000).optional()
        .describe('Initial content for the document. Supports markdown: # headings, **bold**, *italic*, `code`, [links](url), - bullets, 1. numbered lists'),
    }),
    output: createDocumentOutput,
    approvalRequiredFields: ['title', 'content'],
  },

  appendToDocument: {
    description: 'Append text content to the end of a Google Doc',
    input: z.object({
      documentId: commonSchemas.documentId.describe('The ID of the Google Doc'),
      content: commonSchemas.content.describe('Content to append. Supports markdown: # headings, **bold**, *italic*, `code`, [links](url), - bullets, 1. numbered lists'),
    }),
    output: updateDocumentOutput,
    approvalRequiredFields: ['documentId', 'title', 'currentContent', 'newContent'],
  },

  searchDocuments: {
    description: 'Search for Google Docs by content or title',
    input: z.object({
      query: commonSchemas.searchQuery.describe('Search query (searches document names)'),
      maxResults: z.coerce.number().int().min(1).max(100).default(10)
        .describe('Maximum number of results (default 10)'),
    }),
    output: z.array(documentListItemOutput).describe('Array of matching documents'),
  },

  replaceDocumentContent: {
    description: 'Replace the entire content of a Google Doc with new content',
    input: z.object({
      documentId: commonSchemas.documentId.describe('The ID of the Google Doc'),
      content: z.string().max(100000).default('')
        .describe('New content to replace the document with. Supports markdown: # headings, **bold**, *italic*, `code`, [links](url), - bullets, 1. numbered lists'),
    }),
    output: updateDocumentOutput,
    approvalRequiredFields: ['documentId', 'title', 'currentContent', 'newContent'],
  },
});

// Export type for tool names
export type DocsToolName = keyof typeof docsTools;
