/**
 * ToolProvider - Abstract interface for different tool integrations
 *
 * Each ToolProvider handles a specific external service (GitHub, Google Docs, etc.)
 * and provides methods to setup, execute, and cleanup the sandbox environment.
 */

export interface ToolResult {
  success: boolean;
  summary: string;
  artifacts?: ToolArtifact[];
  error?: string;
}

export interface ToolArtifact {
  type: 'diff' | 'file_change' | 'summary' | 'data';
  name: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolContext {
  taskId: string;
  executionId: string;
  boardId: string;
  instructions: string;
  config: Record<string, unknown>;
}

export interface LogCallback {
  (level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
}

/**
 * Abstract base class for all tool providers.
 * Implement this to add support for new external services.
 */
export abstract class ToolProvider {
  protected context: ToolContext;
  protected log: LogCallback;

  constructor(context: ToolContext, log: LogCallback) {
    this.context = context;
    this.log = log;
  }

  /** Unique identifier for this tool provider type */
  abstract readonly type: string;

  /**
   * Setup the sandbox environment.
   * For GitHub: clone the repository
   * For Google Docs: authenticate and fetch document
   */
  abstract setup(sandbox: SandboxInterface): Promise<void>;

  /**
   * Execute the main task using Claude Code.
   * Returns the result including any generated artifacts (diffs, file changes).
   */
  abstract execute(sandbox: SandboxInterface): Promise<ToolResult>;

  /**
   * Cleanup the sandbox environment.
   * Kill any background processes, remove temp files, etc.
   */
  abstract cleanup(sandbox: SandboxInterface): Promise<void>;

  /**
   * Perform a post-execution action.
   * For GitHub: create PR, push branch
   * For Google Docs: apply changes
   */
  abstract action(
    sandbox: SandboxInterface,
    actionName: string,
    params: unknown
  ): Promise<unknown>;
}

/**
 * Sandbox interface - abstraction over Cloudflare Container sandbox
 * This allows for easier testing and potential future sandbox implementations
 */
export interface SandboxInterface {
  /** Execute a command and stream the output */
  execStream(command: string): Promise<ReadableStream<Uint8Array>>;

  /** Execute a command and wait for completion */
  exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;

  /** Start a background process */
  startProcess(command: string): Promise<{ id: string }>;

  /** Stream logs from a background process */
  streamProcessLogs(processId: string): Promise<ReadableStream<Uint8Array>>;

  /** Kill a background process */
  killProcess(processId: string): Promise<void>;

  /** Create a directory */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /** Write a file */
  writeFile(path: string, content: string): Promise<void>;

  /** Read a file */
  readFile(path: string): Promise<{ content: string }>;

  /** Delete a file or directory */
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;

  /** List directory contents */
  ls(path: string): Promise<string[]>;
}
