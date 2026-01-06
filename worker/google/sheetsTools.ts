/**
 * Google Sheets MCP Tool Definitions
 *
 * Single source of truth for Google Sheets tool schemas using Zod.
 * Used for both JSON Schema generation (getTools) and runtime validation (callTool).
 */

import { z } from 'zod';
import { defineTools, commonSchemas } from '../utils/zodTools';

// ============================================================================
// Sheets-specific Schema Components
// ============================================================================

const sheetRange = z.string().max(200)
  .describe('A1 notation range (e.g., "Sheet1", "Sheet1!A1:D10", "A:D")');

const sheetData = z.array(z.array(z.string()))
  .describe('Data as 2D array of strings (rows x columns)');

// ============================================================================
// Output Schemas
// ============================================================================

const sheetInfoOutput = z.object({
  sheetId: z.number().describe('Sheet ID'),
  title: z.string().describe('Sheet name'),
  rowCount: z.number().optional().describe('Number of rows'),
  columnCount: z.number().optional().describe('Number of columns'),
});

const spreadsheetDetailOutput = z.object({
  spreadsheetId: z.string().describe('Spreadsheet ID'),
  title: z.string().describe('Spreadsheet title'),
  url: z.string().describe('URL to view/edit spreadsheet'),
  sheets: z.array(sheetInfoOutput).describe('List of sheets in the spreadsheet'),
});

const sheetDataOutput = z.object({
  range: z.string().describe('The range that was read'),
  rows: z.array(z.array(z.string())).describe('The cell values as a 2D array of strings'),
});

const spreadsheetListItemOutput = z.object({
  spreadsheetId: z.string().describe('Spreadsheet ID'),
  title: z.string().describe('Spreadsheet title'),
  modifiedTime: z.string().optional().describe('Last modified timestamp'),
  url: z.string().optional().describe('URL to view/edit spreadsheet'),
});

const createSpreadsheetOutput = z.object({
  spreadsheetId: z.string().describe('Created spreadsheet ID'),
  title: z.string().describe('Spreadsheet title'),
  url: z.string().describe('URL to view/edit spreadsheet'),
});

const updateSpreadsheetOutput = z.object({
  success: z.boolean().describe('Whether operation succeeded'),
  spreadsheetId: z.string().describe('Spreadsheet ID'),
  updatedRange: z.string().optional().describe('The range that was updated'),
  updatedRows: z.number().optional().describe('Number of rows affected'),
  updatedCells: z.number().optional().describe('Number of cells affected'),
});

// ============================================================================
// Tool Definitions
// ============================================================================

export const sheetsTools = defineTools({
  getSpreadsheet: {
    description: 'Get metadata about a spreadsheet (title, sheets list, properties)',
    input: z.object({
      spreadsheetId: commonSchemas.spreadsheetId.describe('The ID of the spreadsheet (from the URL)'),
    }),
    output: spreadsheetDetailOutput,
  },

  getSheetData: {
    description: 'Read data from a specific sheet or range',
    input: z.object({
      spreadsheetId: commonSchemas.spreadsheetId.describe('The ID of the spreadsheet'),
      range: sheetRange,
    }),
    output: sheetDataOutput,
  },

  listSpreadsheets: {
    description: 'List recent Google Spreadsheets from Drive',
    input: z.object({
      maxResults: z.coerce.number().int().min(1).max(100).default(10)
        .describe('Maximum number of spreadsheets to return (default 10)'),
      query: z.string().max(500).optional()
        .describe('Search query for spreadsheet names'),
    }),
    output: z.array(spreadsheetListItemOutput).describe('Array of spreadsheet summaries'),
  },

  searchSpreadsheets: {
    description: 'Search for Google Spreadsheets by name',
    input: z.object({
      query: commonSchemas.searchQuery.describe('Search query (searches spreadsheet names)'),
      maxResults: z.coerce.number().int().min(1).max(100).default(10)
        .describe('Maximum number of results (default 10)'),
    }),
    output: z.array(spreadsheetListItemOutput).describe('Array of matching spreadsheets'),
  },

  createSpreadsheet: {
    description: 'Create a new Google Spreadsheet',
    input: z.object({
      title: commonSchemas.title.describe('Title of the new spreadsheet'),
      sheetTitle: z.string().max(100).default('Sheet1')
        .describe('Name of the first sheet (default "Sheet1")'),
      data: sheetData.optional()
        .describe('Initial data as 2D array of strings (rows x columns)'),
    }),
    output: createSpreadsheetOutput,
    approvalRequiredFields: ['title', 'rows'],
  },

  appendRows: {
    description: 'Append rows to the end of a sheet',
    input: z.object({
      spreadsheetId: commonSchemas.spreadsheetId.describe('The ID of the spreadsheet'),
      title: commonSchemas.title.optional()
        .describe('Title of the spreadsheet (for display in results)'),
      sheetName: z.string().max(100).default('Sheet1')
        .describe('Name of the sheet to append to (default first sheet)'),
      rows: z.array(z.array(z.string())).min(1)
        .describe('Rows to append as 2D array of strings'),
    }),
    output: updateSpreadsheetOutput,
    approvalRequiredFields: ['spreadsheetId', 'title', 'currentRows', 'newRows'],
  },

  updateCells: {
    description: 'Update specific cells in a sheet',
    input: z.object({
      spreadsheetId: commonSchemas.spreadsheetId.describe('The ID of the spreadsheet'),
      title: commonSchemas.title.optional()
        .describe('Title of the spreadsheet (for display in results)'),
      range: sheetRange.describe('A1 notation range to update (e.g., "Sheet1!A1:B2")'),
      values: z.array(z.array(z.string()))
        .describe('New values as 2D array of strings'),
    }),
    output: updateSpreadsheetOutput,
    approvalRequiredFields: ['spreadsheetId', 'title', 'currentRows', 'updates'],
  },

  replaceSheetContent: {
    description: 'Replace all content in a sheet with new data',
    input: z.object({
      spreadsheetId: commonSchemas.spreadsheetId.describe('The ID of the spreadsheet'),
      sheetName: z.string().max(100).optional()
        .describe('Name of the sheet to replace (default first sheet)'),
      data: z.array(z.array(z.string()))
        .describe('New data as 2D array of strings (rows x columns)'),
    }),
    output: z.object({
      success: z.boolean().describe('Whether replacement succeeded'),
      spreadsheetId: z.string().describe('Spreadsheet ID'),
      url: z.string().describe('URL to view/edit spreadsheet'),
    }),
    approvalRequiredFields: ['spreadsheetId', 'title', 'currentRows', 'newRows'],
  },
});

// Export type for tool names
export type SheetsToolName = keyof typeof sheetsTools;
