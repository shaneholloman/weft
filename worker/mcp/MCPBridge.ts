/**
 * MCPBridge - Bridge between workflow execution and MCP servers
 *
 * Routes tool calls from generated workflow code to the appropriate
 * MCP server (hosted or remote) and handles authentication.
 */

import { MCPRegistry, type MCPToolCallResult, type MCPServerConfig } from './MCPClient';
import { GmailMCPServer } from '../google/GmailMCP';
import { DocsMCPServer } from '../google/DocsMCP';
import { logger } from '../utils/logger';

export interface MCPBridgeConfig {
  servers: Array<{
    id: string;
    name: string;
    type: 'remote' | 'hosted';
    endpoint?: string;
    authType: 'none' | 'oauth' | 'api_key' | 'bearer';
  }>;
  credentials: {
    google?: string;  // Google OAuth token
    github?: string;  // GitHub OAuth token
    // Add more as needed
  };
}

export interface ToolCallRequest {
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolCallResponse {
  success: boolean;
  result?: MCPToolCallResult;
  error?: string;
}

/**
 * MCPBridge manages connections to MCP servers and routes tool calls
 */
export class MCPBridge {
  private registry: MCPRegistry;
  private config: MCPBridgeConfig;
  private initialized = false;

  constructor(config: MCPBridgeConfig) {
    this.config = config;
    this.registry = new MCPRegistry();
  }

  /**
   * Initialize connections to all configured MCP servers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (const server of this.config.servers) {
      try {
        if (server.type === 'hosted') {
          await this.initializeHostedServer(server);
        } else {
          await this.initializeRemoteServer(server);
        }
      } catch (error) {
        logger.mcpBridge.error('Failed to initialize MCP server', { server: server.name, error: error instanceof Error ? error.message : String(error) });
      }
    }

    this.initialized = true;
  }

  /**
   * Initialize a hosted MCP server (our wrappers)
   */
  private async initializeHostedServer(server: {
    id: string;
    name: string;
  }): Promise<void> {
    const serverNameLower = server.name.toLowerCase();

    if (serverNameLower.includes('gmail')) {
      if (!this.config.credentials.google) {
        logger.mcpBridge.warn('Gmail MCP requires Google OAuth token');
        return;
      }
      const gmail = new GmailMCPServer(this.config.credentials.google);
      this.registry.registerHosted(server.id, gmail);
      logger.mcpBridge.info('Registered hosted MCP', { server: server.name });
    }

    if (serverNameLower.includes('docs') || serverNameLower.includes('google docs')) {
      if (!this.config.credentials.google) {
        logger.mcpBridge.warn('Google Docs MCP requires Google OAuth token');
        return;
      }
      const docs = new DocsMCPServer(this.config.credentials.google);
      this.registry.registerHosted(server.id, docs);
      logger.mcpBridge.info('Registered hosted MCP', { server: server.name });
    }

    // Add more hosted servers here as needed
  }

  /**
   * Initialize a remote MCP server
   */
  private async initializeRemoteServer(server: {
    id: string;
    name: string;
    endpoint?: string;
    authType: 'none' | 'oauth' | 'api_key' | 'bearer';
  }): Promise<void> {
    if (!server.endpoint) {
      logger.mcpBridge.warn('Remote MCP server has no endpoint', { server: server.name });
      return;
    }

    const config: MCPServerConfig = {
      id: server.id,
      name: server.name,
      type: 'remote',
      endpoint: server.endpoint,
      authType: server.authType,
      credentials: {},
    };

    // Add credentials based on auth type
    if (server.authType === 'bearer' || server.authType === 'oauth') {
      // Try to match credential based on server name
      if (server.name.toLowerCase().includes('github') && this.config.credentials.github) {
        config.credentials = { token: this.config.credentials.github };
      }
    }

    const client = this.registry.registerRemote(config);

    try {
      await client.initialize();
      logger.mcpBridge.info('Initialized remote MCP', { server: server.name });
    } catch (error) {
      logger.mcpBridge.error('Failed to initialize remote MCP', { server: server.name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(request: ToolCallRequest): Promise<ToolCallResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { serverName, toolName, args } = request;

    // Find server by name (case-insensitive, normalized)
    const normalizedName = serverName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const server = this.config.servers.find(s => {
      const sNormalized = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return sNormalized === normalizedName || s.id === serverName;
    });

    if (!server) {
      return {
        success: false,
        error: `MCP server not found: ${serverName}`,
      };
    }

    try {
      const result = await this.registry.callTool(server.id, toolName, args);
      return {
        success: !result.isError,
        result,
        error: result.isError ? result.content[0]?.text : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all available tools across all servers
   */
  async getAllTools(): Promise<Map<string, { name: string; tools: string[] }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const allTools = await this.registry.getAllTools();
    const result = new Map<string, { name: string; tools: string[] }>();

    for (const server of this.config.servers) {
      const tools = allTools.get(server.id);
      if (tools) {
        result.set(server.id, {
          name: server.name,
          tools: tools.map(t => t.name),
        });
      }
    }

    return result;
  }

  /**
   * Get tools for a specific server
   */
  async getServerTools(serverIdOrName: string): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const normalizedName = serverIdOrName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const server = this.config.servers.find(s => {
      const sNormalized = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return sNormalized === normalizedName || s.id === serverIdOrName;
    });

    if (!server) {
      return [];
    }

    const allTools = await this.registry.getAllTools();
    const tools = allTools.get(server.id);
    return tools ? tools.map(t => t.name) : [];
  }
}

/**
 * Create a workflow context object for executing generated code
 * This provides the `ctx` object that generated code expects
 */
export function createWorkflowContext(
  _bridge: MCPBridge,
  onStep: (stepId: string) => void,
  onLog: (message: string) => void,
  onCheckpoint: (options: {
    message: string;
    data?: Record<string, unknown>;
    actions?: string[];
  }) => Promise<{ action: string; data?: Record<string, unknown> }>
) {
  const stepResults: Record<string, unknown> = {};

  return {
    step: (id: string) => {
      onStep(id);
    },

    log: (message: string) => {
      onLog(message);
    },

    checkpoint: async (options: {
      message: string;
      data?: Record<string, unknown>;
      actions?: string[];
    }) => {
      return onCheckpoint(options);
    },

    input: {} as Record<string, unknown>,
    stepResults,
  };
}

/**
 * Create proxy objects for MCP servers that can be used in generated code
 * Returns an object like { Gmail: { sendEmail: fn, listMessages: fn, ... } }
 */
export async function createMCPProxies(
  bridge: MCPBridge
): Promise<Record<string, Record<string, (args: Record<string, unknown>) => Promise<MCPToolCallResult>>>> {
  const allTools = await bridge.getAllTools();
  const proxies: Record<string, Record<string, (args: Record<string, unknown>) => Promise<MCPToolCallResult>>> = {};

  for (const [serverId, { name, tools }] of allTools) {
    // Normalize server name to valid JS identifier
    const serverKey = name.replace(/[^a-zA-Z0-9]/g, '_');

    proxies[serverKey] = {};

    for (const toolName of tools) {
      proxies[serverKey][toolName] = async (args: Record<string, unknown>) => {
        const result = await bridge.callTool({
          serverName: serverId,
          toolName,
          args,
        });

        if (!result.success) {
          throw new Error(result.error || 'Tool call failed');
        }

        return result.result!;
      };
    }
  }

  return proxies;
}
