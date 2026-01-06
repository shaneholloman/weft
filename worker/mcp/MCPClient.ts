/**
 * MCPClient - Client for connecting to MCP (Model Context Protocol) servers
 *
 * Supports both remote MCP servers (via HTTP/SSE) and hosted MCP wrappers.
 * Implements the MCP specification for tool discovery and invocation.
 */

import { logger } from '../utils/logger';

// MCP Protocol Types
export interface MCPToolSchema {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;  // Schema for structuredContent return type
  annotations?: Record<string, unknown>;
  /** Fields required in approval data when using request_approval for this tool */
  approvalRequiredFields?: string[];
}

export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer' | 'null';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
}

export type JSONSchemaProperty = JSONSchema;

export interface MCPToolCallResult {
  content: MCPContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

// MCP Server Configuration
export interface MCPServerConfig {
  id: string;
  name: string;
  type: 'remote' | 'hosted';
  endpoint?: string;
  authType: 'none' | 'oauth' | 'api_key' | 'bearer';
  credentials?: {
    token?: string;
    apiKey?: string;
  };
  /** Transport type for remote servers. Defaults to 'streamable-http' */
  transportType?: 'streamable-http' | 'sse';
}

// JSON-RPC Types
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// SSE Event parsed from stream
interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

/**
 * SSE Transport for MCP protocol
 *
 * Handles the SSE connection lifecycle for per-request operations:
 * 1. Connect to SSE endpoint (GET)
 * 2. Wait for 'endpoint' event with POST URL
 * 3. POST JSON-RPC request to that URL
 * 4. Wait for response via SSE 'message' event
 * 5. Close connection
 */
class SSETransport {
  private baseEndpoint: string;
  private headers: Record<string, string>;
  private connectionTimeout: number;
  private responseTimeout: number;

  constructor(
    endpoint: string,
    headers: Record<string, string>,
    options?: { connectionTimeout?: number; responseTimeout?: number }
  ) {
    this.baseEndpoint = endpoint;
    this.headers = headers;
    this.connectionTimeout = options?.connectionTimeout ?? 10000; // 10s
    this.responseTimeout = options?.responseTimeout ?? 30000; // 30s
  }

  /**
   * Send a JSON-RPC request via SSE transport
   */
  async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const controller = new AbortController();
    const totalTimeout = setTimeout(
      () => controller.abort(),
      this.connectionTimeout + this.responseTimeout
    );

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const sseResponse = await this.connectWithTimeout(controller.signal);

      if (!sseResponse.body) {
        throw new Error('SSE response has no body');
      }

      reader = sseResponse.body.getReader();

      const { messageEndpoint, sessionId } = await this.waitForEndpointEvent(
        reader,
        controller.signal
      );

      const postHeaders: Record<string, string> = {
        ...this.headers,
        'Content-Type': 'application/json',
      };
      if (sessionId) {
        postHeaders['Mcp-Session-Id'] = sessionId;
      }

      const postResponse = await fetch(messageEndpoint, {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!postResponse.ok) {
        throw new Error(`POST to message endpoint failed: ${postResponse.status}`);
      }

      const response = await this.waitForResponse(reader, request.id, controller.signal);

      return response;
    } finally {
      clearTimeout(totalTimeout);
      // Clean up reader
      if (reader) {
        try {
          reader.releaseLock();
        } catch {
          // Ignore release errors
        }
      }
      controller.abort(); // Ensure cleanup
    }
  }

  /**
   * Connect to SSE endpoint with timeout
   */
  private async connectWithTimeout(signal: AbortSignal): Promise<Response> {
    const connectionController = new AbortController();
    const connectionTimeout = setTimeout(
      () => connectionController.abort(),
      this.connectionTimeout
    );

    // Combine signals
    signal.addEventListener('abort', () => connectionController.abort());

    try {
      const response = await fetch(this.baseEndpoint, {
        method: 'GET',
        headers: {
          ...this.headers,
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: connectionController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(connectionTimeout);
    }
  }

  /**
   * Wait for the 'endpoint' event from SSE stream
   */
  private async waitForEndpointEvent(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    signal: AbortSignal
  ): Promise<{ messageEndpoint: string; sessionId?: string }> {
    const decoder = new TextDecoder();
    let buffer = '';

    while (!signal.aborted) {
      const { done, value } = await reader.read();

      if (done) {
        throw new Error('SSE stream ended before endpoint event received');
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const { parsed, remaining } = this.parseSSEBuffer(buffer);
      buffer = remaining;

      for (const event of parsed) {
        if (event.event === 'endpoint') {
          try {
            const data = JSON.parse(event.data);
            // MCP SSE spec uses 'uri' field
            const messageEndpoint = data.uri || data.url || data.endpoint;
            if (!messageEndpoint) {
              throw new Error('Endpoint event missing uri field');
            }
            return {
              messageEndpoint,
              sessionId: data.sessionId,
            };
          } catch (e) {
            throw new Error(`Failed to parse endpoint event: ${e}`);
          }
        }
      }
    }

    throw new Error('Aborted while waiting for endpoint event');
  }

  /**
   * Wait for a JSON-RPC response matching the request ID via SSE 'message' event
   */
  private async waitForResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    requestId: string | number,
    signal: AbortSignal
  ): Promise<JSONRPCResponse> {
    const decoder = new TextDecoder();
    let buffer = '';
    const startTime = Date.now();

    while (!signal.aborted) {
      // Check response timeout
      if (Date.now() - startTime > this.responseTimeout) {
        throw new Error('Timeout waiting for SSE response');
      }

      const { done, value } = await reader.read();

      if (done) {
        throw new Error('SSE stream ended before response received');
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const { parsed, remaining } = this.parseSSEBuffer(buffer);
      buffer = remaining;

      for (const event of parsed) {
        // MCP SSE spec sends responses as 'message' events
        if (event.event === 'message' || !event.event) {
          try {
            const response = JSON.parse(event.data) as JSONRPCResponse;
            // Match response to request ID
            if (response.id === requestId) {
              return response;
            }
          } catch {
            // Not valid JSON-RPC, skip
          }
        }
      }
    }

    throw new Error('Aborted while waiting for response');
  }

  /**
   * Parse SSE format from buffer
   * Returns parsed events and remaining unparsed data
   */
  private parseSSEBuffer(buffer: string): {
    parsed: SSEEvent[];
    remaining: string;
  } {
    const events: SSEEvent[] = [];
    const lines = buffer.split('\n');
    let remaining = '';

    let currentEvent: { event?: string; data: string[]; id?: string } = { data: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this is the last line and might be incomplete
      if (i === lines.length - 1 && !buffer.endsWith('\n')) {
        remaining = line;
        break;
      }

      if (line === '') {
        // Empty line marks end of event
        if (currentEvent.data.length > 0) {
          events.push({
            event: currentEvent.event,
            data: currentEvent.data.join('\n'),
            id: currentEvent.id,
          });
        }
        currentEvent = { data: [] };
      } else if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data.push(line.slice(5).trimStart());
      } else if (line.startsWith('id:')) {
        currentEvent.id = line.slice(3).trim();
      }
      // Ignore other lines (comments starting with :, etc.)
    }

    return { parsed: events, remaining };
  }
}

/**
 * Streamable HTTP Transport for MCP protocol (current standard)
 *
 * Simple POST-based transport:
 * 1. POST JSON-RPC request to endpoint
 * 2. Response is either JSON or SSE stream
 * 3. Parse and return result
 */
class StreamableHTTPTransport {
  private endpoint: string;
  private headers: Record<string, string>;
  private responseTimeout: number;
  private sessionId?: string;
  private protocolVersion: string;

  constructor(
    endpoint: string,
    headers: Record<string, string>,
    options?: { responseTimeout?: number; protocolVersion?: string }
  ) {
    this.endpoint = endpoint;
    this.headers = headers;
    this.responseTimeout = options?.responseTimeout ?? 30000; // 30s
    this.protocolVersion = options?.protocolVersion ?? '2025-03-26';
  }

  /**
   * Send a JSON-RPC request via Streamable HTTP transport
   */
  async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.responseTimeout);

    try {
      const requestHeaders: Record<string, string> = {
        ...this.headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': this.protocolVersion,
      };

      if (this.sessionId) {
        requestHeaders['Mcp-Session-Id'] = this.sessionId;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      // Capture session ID from response headers
      const newSessionId = response.headers.get('Mcp-Session-Id');
      if (newSessionId) {
        this.sessionId = newSessionId;
      }

      if (!response.ok) {
        // Try to parse error response
        try {
          const errorBody = await response.json() as JSONRPCResponse;
          if (errorBody.error) {
            return errorBody;
          }
        } catch {
          // Ignore parse errors
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('text/event-stream')) {
        // Parse SSE stream for response
        return this.parseSSEResponse(response.body!, request.id, controller.signal);
      } else {
        // Direct JSON response
        return response.json() as Promise<JSONRPCResponse>;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse SSE stream to extract JSON-RPC response
   */
  private async parseSSEResponse(
    body: ReadableStream<Uint8Array>,
    requestId: string | number,
    signal: AbortSignal
  ): Promise<JSONRPCResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();

        if (done) {
          throw new Error('SSE stream ended before response received');
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const { parsed, remaining } = this.parseSSEBuffer(buffer);
        buffer = remaining;

        for (const event of parsed) {
          // Look for message events containing our response
          if (event.event === 'message' || !event.event) {
            try {
              const response = JSON.parse(event.data) as JSONRPCResponse;
              if (response.id === requestId) {
                return response;
              }
            } catch {
              // Not valid JSON-RPC, continue
            }
          }
        }
      }

      throw new Error('Aborted while waiting for response');
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse SSE format from buffer
   */
  private parseSSEBuffer(buffer: string): {
    parsed: SSEEvent[];
    remaining: string;
  } {
    const events: SSEEvent[] = [];
    const lines = buffer.split('\n');
    let remaining = '';

    let currentEvent: { event?: string; data: string[]; id?: string } = { data: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this is the last line and might be incomplete
      if (i === lines.length - 1 && !buffer.endsWith('\n')) {
        remaining = line;
        break;
      }

      if (line === '') {
        // Empty line marks end of event
        if (currentEvent.data.length > 0) {
          events.push({
            event: currentEvent.event,
            data: currentEvent.data.join('\n'),
            id: currentEvent.id,
          });
        }
        currentEvent = { data: [] };
      } else if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data.push(line.slice(5).trimStart());
      } else if (line.startsWith('id:')) {
        currentEvent.id = line.slice(3).trim();
      }
    }

    return { parsed: events, remaining };
  }
}

/**
 * MCP Client for communicating with MCP servers
 */
export class MCPClient {
  private config: MCPServerConfig;
  private requestId = 0;
  private sseTransport?: SSETransport;
  private streamableHTTPTransport?: StreamableHTTPTransport;

  constructor(config: MCPServerConfig) {
    this.config = config;

    if (config.endpoint) {
      const headers = this.buildAuthHeaders();

      if (config.transportType === 'sse') {
        // Legacy SSE transport (deprecated)
        this.sseTransport = new SSETransport(config.endpoint, headers);
      } else {
        // Streamable HTTP transport (default, current standard)
        this.streamableHTTPTransport = new StreamableHTTPTransport(config.endpoint, headers);
      }
    }
  }

  /**
   * Build authentication headers based on config
   */
  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (
      (this.config.authType === 'bearer' || this.config.authType === 'oauth') &&
      this.config.credentials?.token
    ) {
      headers['Authorization'] = `Bearer ${this.config.credentials.token}`;
    } else if (this.config.authType === 'api_key' && this.config.credentials?.apiKey) {
      headers['X-API-Key'] = this.config.credentials.apiKey;
    }

    return headers;
  }

  /**
   * Initialize connection and get server capabilities
   */
  async initialize(): Promise<{ protocolVersion: string; capabilities: unknown }> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'weft',
        version: '1.0.0',
      },
    });

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {});

    return response as { protocolVersion: string; capabilities: unknown };
  }

  /**
   * List all available tools from the MCP server
   */
  async listTools(): Promise<MCPToolSchema[]> {
    const response = await this.sendRequest('tools/list', {});
    const result = response as { tools: MCPToolSchema[] };
    return result.tools || [];
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    return response as MCPToolCallResult;
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (this.config.type === 'hosted') {
      // For hosted MCP wrappers, we'll use internal routing
      throw new Error('Hosted MCP servers should use direct method calls');
    }

    if (!this.config.endpoint) {
      throw new Error('Remote MCP server requires an endpoint');
    }

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    // Dispatch based on transport type
    if (this.config.transportType === 'sse' && this.sseTransport) {
      return this.sendViaTransport(this.sseTransport, request);
    } else if (this.streamableHTTPTransport) {
      return this.sendViaTransport(this.streamableHTTPTransport, request);
    } else {
      throw new Error('No transport configured');
    }
  }

  /**
   * Send request via transport (SSE or Streamable HTTP)
   */
  private async sendViaTransport(
    transport: SSETransport | StreamableHTTPTransport,
    request: JSONRPCRequest
  ): Promise<unknown> {
    const response = await transport.sendRequest(request);

    if (response.error) {
      throw new Error(`MCP error: ${response.error.message} (code: ${response.error.code})`);
    }

    return response.result;
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private async sendNotification(method: string, params: unknown): Promise<void> {
    if (this.config.type === 'hosted' || !this.config.endpoint) {
      return; // Skip for hosted servers
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (
      (this.config.authType === 'bearer' || this.config.authType === 'oauth') &&
      this.config.credentials?.token
    ) {
      headers['Authorization'] = `Bearer ${this.config.credentials.token}`;
    }

    await fetch(this.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(notification),
    });
  }
}

/**
 * Abstract base class for hosted MCP wrappers
 * Implement this to create MCP-compatible wrappers for APIs like Gmail, Google Docs
 */
export abstract class HostedMCPServer {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Get all tools provided by this MCP server
   */
  abstract getTools(): MCPToolSchema[];

  /**
   * Call a tool with the given arguments
   */
  abstract callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;

  /**
   * Helper to create a text content response
   */
  protected textContent(text: string): MCPToolCallResult {
    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Helper to create an error response
   */
  protected errorContent(message: string): MCPToolCallResult {
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }

  /**
   * Helper to create a JSON response
   */
  protected jsonContent(data: unknown): MCPToolCallResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
}

/**
 * Registry for managing multiple MCP servers
 */
export class MCPRegistry {
  private remoteClients = new Map<string, MCPClient>();
  private hostedServers = new Map<string, HostedMCPServer>();
  private toolCache = new Map<string, MCPToolSchema[]>();

  /**
   * Register a remote MCP server
   */
  registerRemote(config: MCPServerConfig): MCPClient {
    const client = new MCPClient(config);
    this.remoteClients.set(config.id, client);
    return client;
  }

  /**
   * Register a hosted MCP server
   */
  registerHosted(id: string, server: HostedMCPServer): void {
    this.hostedServers.set(id, server);
  }

  /**
   * Get all tools from all registered servers
   */
  async getAllTools(): Promise<Map<string, MCPToolSchema[]>> {
    const allTools = new Map<string, MCPToolSchema[]>();

    // Get tools from remote servers
    for (const [id, client] of this.remoteClients) {
      try {
        const tools = await client.listTools();
        allTools.set(id, tools);
        this.toolCache.set(id, tools);
      } catch (error) {
        logger.mcp.error('Failed to get tools', { serverId: id, error: error instanceof Error ? error.message : String(error) });
        // Use cached if available
        const cached = this.toolCache.get(id);
        if (cached) {
          allTools.set(id, cached);
        }
      }
    }

    // Get tools from hosted servers
    for (const [id, server] of this.hostedServers) {
      const tools = server.getTools();
      allTools.set(id, tools);
    }

    return allTools;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    const hostedServer = this.hostedServers.get(serverId);
    if (hostedServer) {
      return hostedServer.callTool(toolName, args);
    }

    const remoteClient = this.remoteClients.get(serverId);
    if (remoteClient) {
      return remoteClient.callTool(toolName, args);
    }

    throw new Error(`MCP server not found: ${serverId}`);
  }

  /**
   * Get a specific server's client
   */
  getClient(serverId: string): MCPClient | undefined {
    return this.remoteClients.get(serverId);
  }

  /**
   * Get a hosted server
   */
  getHosted(serverId: string): HostedMCPServer | undefined {
    return this.hostedServers.get(serverId);
  }

  /**
   * Remove a server from the registry
   */
  remove(serverId: string): void {
    this.remoteClients.delete(serverId);
    this.hostedServers.delete(serverId);
    this.toolCache.delete(serverId);
  }
}
