/**
 * SheetsMCP - Hosted MCP wrapper for Google Sheets API
 *
 * Provides MCP-compatible tools for Google Sheets operations:
 * - getSpreadsheet: Get spreadsheet metadata
 * - getSheetData: Read data from a sheet
 * - listSpreadsheets: List recent spreadsheets
 * - searchSpreadsheets: Search spreadsheets by name
 * - createSpreadsheet: Create a new spreadsheet
 * - appendRows: Append rows to a sheet
 * - updateCells: Update specific cell range
 * - replaceSheetContent: Replace all content in a sheet
 */

import { HostedMCPServer, type MCPToolSchema, type MCPToolCallResult } from '../mcp/MCPClient';
import { toolsToMCPSchemas, parseToolArgs } from '../utils/zodTools';
import { sheetsTools } from './sheetsTools';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DEFAULT_MAX_RESULTS = 10;

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  properties: {
    title: string;
    locale?: string;
    timeZone?: string;
  };
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      index: number;
      gridProperties?: {
        rowCount: number;
        columnCount: number;
      };
    };
  }>;
  spreadsheetUrl: string;
}

export interface SheetValues {
  range: string;
  majorDimension: string;
  values?: string[][];
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

export class SheetsMCPServer extends HostedMCPServer {
  readonly name = 'Google Sheets';
  readonly description = 'Google Sheets API for reading, creating, and editing spreadsheets';

  private accessToken: string;

  constructor(accessToken: string) {
    super();
    this.accessToken = accessToken;
  }

  getTools(): MCPToolSchema[] {
    return toolsToMCPSchemas(sheetsTools);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    try {
      switch (name) {
        case 'getSpreadsheet':
          return await this.getSpreadsheet(args);
        case 'getSheetData':
          return await this.getSheetData(args);
        case 'listSpreadsheets':
          return await this.listSpreadsheets(args);
        case 'searchSpreadsheets':
          return await this.searchSpreadsheets(args);
        case 'createSpreadsheet':
          return await this.createSpreadsheet(args);
        case 'appendRows':
          return await this.appendRows(args);
        case 'updateCells':
          return await this.updateCells(args);
        case 'replaceSheetContent':
          return await this.replaceSheetContent(args);
        default:
          return this.errorContent(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return this.errorContent(error instanceof Error ? error.message : String(error));
    }
  }

  private async getSpreadsheet(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { spreadsheetId } = parseToolArgs(sheetsTools.getSpreadsheet.input, args);

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}?fields=spreadsheetId,properties,sheets.properties,spreadsheetUrl`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.status}`);
    }

    const data = await response.json() as SpreadsheetMetadata;

    const result = {
      spreadsheetId: data.spreadsheetId,
      title: data.properties.title,
      url: data.spreadsheetUrl,
      sheets: data.sheets.map((sheet) => ({
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        rowCount: sheet.properties.gridProperties?.rowCount,
        columnCount: sheet.properties.gridProperties?.columnCount,
      })),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  private async getSheetData(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { spreadsheetId, range } = parseToolArgs(sheetsTools.getSheetData.input, args);

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.status}`);
    }

    const data = await response.json() as SheetValues;

    const result = {
      range: data.range,
      rows: data.values || [],
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  private async listSpreadsheets(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { maxResults = DEFAULT_MAX_RESULTS, query } = parseToolArgs(sheetsTools.listSpreadsheets.input, args);

    // Build Drive API query for Google Sheets
    // Escape special characters for Google Drive query syntax
    let driveQuery = "mimeType='application/vnd.google-apps.spreadsheet'";
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
      spreadsheetId: file.id,
      title: file.name,
      modifiedTime: file.modifiedTime,
      url: file.webViewLink,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      structuredContent: results,
    };
  }

  private async searchSpreadsheets(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { query, maxResults = DEFAULT_MAX_RESULTS } = parseToolArgs(sheetsTools.searchSpreadsheets.input, args);
    return this.listSpreadsheets({ query, maxResults });
  }

  private async createSpreadsheet(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { title, sheetTitle = 'Sheet1', data } = parseToolArgs(sheetsTools.createSpreadsheet.input, args);

    // Create the spreadsheet
    const createResponse = await fetch(
      SHEETS_API_BASE,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { title },
          sheets: [{ properties: { title: sheetTitle } }],
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Google Sheets API error: ${createResponse.status} - ${error}`);
    }

    const spreadsheet = await createResponse.json() as SpreadsheetMetadata;

    // If data provided, insert it
    if (data && data.length > 0) {
      await this.writeValues(spreadsheet.spreadsheetId, sheetTitle, data);
    }

    const result = {
      spreadsheetId: spreadsheet.spreadsheetId,
      title: spreadsheet.properties.title,
      url: spreadsheet.spreadsheetUrl,
    };

    return {
      content: [{ type: 'text', text: `Spreadsheet created successfully: ${result.url}` }],
      structuredContent: result,
    };
  }

  private async appendRows(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { spreadsheetId, sheetName = 'Sheet1', rows, title: titleArg } = parseToolArgs(sheetsTools.appendRows.input, args);
    let title = titleArg;

    // Fetch title from spreadsheet metadata if not provided
    if (!title) {
      const metaResponse = await fetch(
        `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );
      if (metaResponse.ok) {
        const metadata = await metaResponse.json() as SpreadsheetMetadata;
        title = metadata.properties.title;
      }
    }

    const range = `${sheetName}!A:A`; // Append to first column, API will extend

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Sheets API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      updates: {
        updatedRange: string;
        updatedRows: number;
        updatedCells: number;
      };
    };

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    const result = {
      success: true,
      spreadsheetId,
      url,
      title: title || 'Spreadsheet',
      updatedRange: data.updates.updatedRange,
      updatedRows: data.updates.updatedRows,
    };

    return {
      content: [{ type: 'text', text: `Appended ${result.updatedRows} rows successfully: ${url}` }],
      structuredContent: result,
    };
  }

  private async updateCells(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { spreadsheetId, range, values, title: titleArg } = parseToolArgs(sheetsTools.updateCells.input, args);
    let title = titleArg;

    // Fetch title from spreadsheet metadata if not provided
    if (!title) {
      const metaResponse = await fetch(
        `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );
      if (metaResponse.ok) {
        const metadata = await metaResponse.json() as SpreadsheetMetadata;
        title = metadata.properties.title;
      }
    }

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Sheets API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      updatedRange: string;
      updatedCells: number;
    };

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    const result = {
      success: true,
      spreadsheetId,
      url,
      title: title || 'Spreadsheet',
      updatedRange: data.updatedRange,
      updatedCells: data.updatedCells,
    };

    return {
      content: [{ type: 'text', text: `Updated ${result.updatedCells} cells successfully: ${url}` }],
      structuredContent: result,
    };
  }

  private async replaceSheetContent(args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const { spreadsheetId, sheetName, data } = parseToolArgs(sheetsTools.replaceSheetContent.input, args);

    // Get spreadsheet metadata to find the sheet
    const metaResponse = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties,spreadsheetUrl`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!metaResponse.ok) {
      throw new Error(`Google Sheets API error: ${metaResponse.status}`);
    }

    const metadata = await metaResponse.json() as SpreadsheetMetadata;
    const targetSheet = sheetName
      ? metadata.sheets.find((s) => s.properties.title === sheetName)
      : metadata.sheets[0];

    if (!targetSheet) {
      throw new Error(`Sheet "${sheetName || 'default'}" not found`);
    }

    const targetSheetName = targetSheet.properties.title;
    const sheetId = targetSheet.properties.sheetId;

    // Clear the sheet first
    const clearResponse = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              updateCells: {
                range: { sheetId },
                fields: 'userEnteredValue',
              },
            },
          ],
        }),
      }
    );

    if (!clearResponse.ok) {
      const error = await clearResponse.text();
      throw new Error(`Failed to clear sheet: ${clearResponse.status} - ${error}`);
    }

    // Write new data
    if (data.length > 0) {
      await this.writeValues(spreadsheetId, targetSheetName, data);
    }

    const result = {
      success: true,
      spreadsheetId,
      url: metadata.spreadsheetUrl,
      title: metadata.properties?.title || 'Spreadsheet',
    };

    return {
      content: [{ type: 'text', text: `Sheet content replaced successfully: ${result.url}` }],
      structuredContent: result,
    };
  }

  private async writeValues(spreadsheetId: string, sheetName: string, values: string[][]): Promise<void> {
    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to write values: ${response.status} - ${error}`);
    }
  }
}
