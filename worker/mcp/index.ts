/**
 * MCP (Model Context Protocol) module
 *
 * Provides infrastructure for connecting to MCP servers and converting
 * their tool schemas to TypeScript for use by the planning agent.
 */

export {
  MCPClient,
  MCPRegistry,
  HostedMCPServer,
  type MCPServerConfig,
  type MCPToolSchema,
  type MCPToolCallResult,
  type MCPContent,
  type JSONSchema,
  type JSONSchemaProperty,
} from './MCPClient';

export {
  mcpToolsToTypeScript,
  generateToolsSummary,
  type TypeScriptDeclaration,
} from './SchemaConverter';

export {
  MCPBridge,
  createWorkflowContext,
  createMCPProxies,
  type MCPBridgeConfig,
  type ToolCallRequest,
  type ToolCallResponse,
} from './MCPBridge';
