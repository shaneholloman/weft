/**
 * Structured logger for Cloudflare Workers
 *
 * Provides consistent log formatting with context.
 * In production, these go to Cloudflare's logging infrastructure.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

function formatLog(level: LogLevel, component: string, message: string, context?: LogContext): string {
  const entry = {
    level,
    component,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(entry);
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return {
    debug(message: string, context?: LogContext) {
      console.log(formatLog('debug', component, message, context));
    },
    info(message: string, context?: LogContext) {
      console.log(formatLog('info', component, message, context));
    },
    warn(message: string, context?: LogContext) {
      console.warn(formatLog('warn', component, message, context));
    },
    error(message: string, context?: LogContext) {
      console.error(formatLog('error', component, message, context));
    },
  };
}

// Pre-configured loggers for common components
export const logger = {
  worker: createLogger('Worker'),
  auth: createLogger('Auth'),
  workflow: createLogger('AgentWorkflow'),
  mcp: createLogger('MCP'),
  mcpBridge: createLogger('MCPBridge'),
  mcpOAuth: createLogger('MCPOAuth'),
  sandbox: createLogger('Sandbox'),
  board: createLogger('BoardService'),
  credential: createLogger('CredentialService'),
  schedule: createLogger('Schedule'),
};
