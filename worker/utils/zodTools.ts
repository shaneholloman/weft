/**
 * Zod-based tool definitions for MCP servers
 *
 * This utility provides a single source of truth for MCP tool definitions
 * using Zod schemas. It eliminates the duplication between JSON Schema
 * definitions in getTools() and Zod schemas in validation.ts.
 *
 * Usage:
 * ```typescript
 * // Define tools with Zod schemas
 * const myTools = defineTools({
 *   myTool: {
 *     description: 'Does something',
 *     input: z.object({ name: z.string() }),
 *     output: z.object({ result: z.string() }),
 *   },
 * });
 *
 * // In getTools()
 * getTools() {
 *   return toolsToMCPSchemas(myTools);
 * }
 *
 * // In callTool()
 * const parsed = myTools.myTool.input.parse(args);
 * ```
 */

import { z } from 'zod';
import type { MCPToolSchema, JSONSchema } from '../mcp/MCPClient';

/**
 * Definition for a single tool
 */
export interface ToolDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny
> {
  /** Tool description shown to the AI */
  description: string;
  /** Zod schema for input validation */
  input: TInput;
  /** Zod schema for output (optional, for documentation) */
  output?: TOutput;
  /** Fields that require user approval before execution */
  approvalRequiredFields?: string[];
}

/**
 * A collection of tool definitions
 */
export type ToolDefinitions = Record<string, ToolDefinition>;

/**
 * Define a collection of tools with Zod schemas
 * This is the main entry point for defining MCP tools
 */
export function defineTools<T extends ToolDefinitions>(tools: T): T {
  return tools;
}

/**
 * Convert a Zod schema to JSON Schema for MCP tool definitions
 * Uses Zod v4's built-in toJSONSchema() method
 */
function zodSchemaToJsonSchema(schema: z.ZodTypeAny): JSONSchema {
  // Use Zod v4's built-in JSON Schema conversion
  const converted = z.toJSONSchema(schema, { target: 'draft-7' });

  // Remove $schema field - MCP doesn't need it
  const { $schema: _schema, ...rest } = converted as Record<string, unknown>;
  return rest as unknown as JSONSchema;
}

/**
 * Convert tool definitions to MCP tool schemas for getTools()
 */
export function toolsToMCPSchemas(tools: ToolDefinitions): MCPToolSchema[] {
  return Object.entries(tools).map(([name, def]) => {
    const schema: MCPToolSchema = {
      name,
      description: def.description,
      inputSchema: zodSchemaToJsonSchema(def.input),
    };

    if (def.output) {
      schema.outputSchema = zodSchemaToJsonSchema(def.output);
    }

    if (def.approvalRequiredFields && def.approvalRequiredFields.length > 0) {
      schema.approvalRequiredFields = def.approvalRequiredFields;
    }

    return schema;
  });
}

/**
 * Parse and validate tool arguments using the Zod schema
 * Throws a descriptive error if validation fails
 */
export function parseToolArgs<T extends z.ZodTypeAny>(
  schema: T,
  args: Record<string, unknown>
): z.infer<T> {
  const result = schema.safeParse(args);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid arguments: ${errors}`);
  }
  return result.data;
}

/**
 * Helper to get a tool's input schema for external use
 */
export function getToolInputSchema<T extends ToolDefinitions>(
  tools: T,
  toolName: keyof T
): z.ZodTypeAny {
  return tools[toolName].input;
}

// ============================================================================
// Common Reusable Schema Components
// ============================================================================

/**
 * Common ID fields used across tools
 */
export const commonSchemas = {
  // Document/resource IDs
  documentId: z.string().max(100).describe('Google Doc ID'),
  spreadsheetId: z.string().max(100).describe('Google Sheets spreadsheet ID'),
  messageId: z.string().max(100).describe('Gmail message ID'),
  threadId: z.string().max(100).describe('Thread/conversation ID'),

  // GitHub-specific
  owner: z.string().max(100).describe('Repository owner (username or organization)'),
  repo: z.string().max(100).describe('Repository name'),
  branch: z.string().max(200).describe('Branch name'),
  gitRef: z.string().max(200).describe('Git ref (branch, tag, or commit SHA)'),
  filePath: z.string().max(500).describe('File path'),

  // Common parameters
  maxResults: z.coerce.number().int().min(1).max(100).default(10)
    .describe('Maximum number of results to return'),
  searchQuery: z.string().max(500).describe('Search query'),
  title: z.string().max(256).describe('Title'),
  content: z.string().max(100000).describe('Content'),
  email: z.string().email().describe('Email address'),

  // Sandbox-specific
  sessionId: z.string().min(1).max(100).describe('Sandbox session ID'),
  sandboxPath: z.string().max(1000).describe('File path in sandbox'),
} as const;
