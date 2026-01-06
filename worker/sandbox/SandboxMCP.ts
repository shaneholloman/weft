/**
 * SandboxMCP - Hosted MCP wrapper for Cloudflare Sandbox operations
 *
 * Enables workflows to use Claude Code and git operations as MCP tools,
 * making them composable with other MCP servers like Gmail, GoogleDocs.
 *
 * Credentials (GitHub token, Anthropic API key) are automatically injected -
 * workflow code never sees secrets.
 */

import { Sandbox } from '@cloudflare/sandbox';
import {
  getSandbox,
  parseSSEStream,
  type ExecEvent,
} from '@cloudflare/sandbox';
import { logger } from '../utils/logger';
import {
  HostedMCPServer,
  type MCPToolSchema,
  type MCPToolCallResult,
} from '../mcp/MCPClient';
import { toolsToMCPSchemas, parseToolArgs } from '../utils/zodTools';
import { sandboxTools } from './sandboxTools';

interface SandboxCredentials {
  githubToken?: string;
  anthropicApiKey?: string;
}

interface SessionInfo {
  sandboxId: string;
  workDir: string;
  repoUrl?: string;
  branch?: string;
}

// Session cache - keyed by sessionId
const sessionCache = new Map<string, SessionInfo>();

// Common build artifacts and secrets to exclude from git staging
const GIT_ADD_EXCLUSIONS = [
  // Python
  ':!**/__pycache__/**',
  ':!*.pyc',
  ':!*.pyo',
  ':!**/.pytest_cache/**',
  ':!**/*.egg-info/**',
  ':!**/.mypy_cache/**',
  ':!**/.ruff_cache/**',
  // Node
  ':!**/node_modules/**',
  ':!**/.next/**',
  ':!**/dist/**',
  // Secrets/env files
  ':!**/.env',
  ':!**/.env.*',
  ':!**/.dev.vars',
].join(' ');

export class SandboxMCPServer extends HostedMCPServer {
  readonly name = 'Sandbox';
  readonly description = 'Execute Claude Code and git operations in an isolated sandbox environment';

  private sandboxBinding: DurableObjectNamespace<Sandbox>;
  private credentials: SandboxCredentials;

  constructor(
    sandboxBinding: DurableObjectNamespace<Sandbox>,
    credentials: SandboxCredentials
  ) {
    super();
    this.sandboxBinding = sandboxBinding;
    this.credentials = credentials;
  }

  getTools(): MCPToolSchema[] {
    return toolsToMCPSchemas(sandboxTools);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    try {
      switch (name) {
        case 'createSession':
          return this.createSession(parseToolArgs(sandboxTools.createSession.input, args));

        case 'runClaude':
          return this.runClaude(parseToolArgs(sandboxTools.runClaude.input, args));

        case 'getDiff':
          return this.getDiff(parseToolArgs(sandboxTools.getDiff.input, args));

        case 'commit':
          return this.commit(parseToolArgs(sandboxTools.commit.input, args));

        case 'push':
          return this.push(parseToolArgs(sandboxTools.push.input, args));

        case 'readFile':
          return this.readFile(parseToolArgs(sandboxTools.readFile.input, args));

        case 'writeFile':
          return this.writeFile(parseToolArgs(sandboxTools.writeFile.input, args));

        case 'exec':
          return this.exec(parseToolArgs(sandboxTools.exec.input, args));

        case 'destroySession':
          return this.destroySession(parseToolArgs(sandboxTools.destroySession.input, args));

        default:
          return this.errorContent(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.errorContent(message);
    }
  }

  // ============================================
  // Tool Implementations
  // ============================================

  private async createSession(args: {
    repoUrl?: string;
    branch: string;
    workDir: string;
  }): Promise<MCPToolCallResult> {
    const sessionId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workDir = `/workspace/${args.workDir}`;
    const branch = args.branch;

    const sandbox = getSandbox(this.sandboxBinding, sessionId);

    // Create workspace
    await sandbox.mkdir('/workspace', { recursive: true });

    if (args.repoUrl) {
      // Inject GitHub token into URL
      let cloneUrl = args.repoUrl;
      if (this.credentials.githubToken && cloneUrl.startsWith('https://')) {
        cloneUrl = cloneUrl.replace('https://', `https://${this.credentials.githubToken}@`);
      }

      // Clone repository
      const cloneStream = await sandbox.execStream(
        `git clone --depth 1 --branch ${branch} ${cloneUrl} ${workDir}`
      );

      for await (const event of parseSSEStream<ExecEvent>(cloneStream)) {
        if (event.type === 'complete') {
          if (event.exitCode !== 0) {
            return this.errorContent(`Git clone failed with exit code ${event.exitCode}`);
          }
          break;
        }
        if (event.type === 'error') {
          return this.errorContent(`Git clone error: ${event.error}`);
        }
      }

      // Configure git
      const setupStream = await sandbox.execStream(
        `cd ${workDir} && ` +
        `git config user.email "weft-workflow@example.com" && ` +
        `git config user.name "Weft Workflow"`
      );

      for await (const event of parseSSEStream<ExecEvent>(setupStream)) {
        if (event.type === 'complete') break;
      }
    } else {
      // Just create the directory
      await sandbox.mkdir(workDir, { recursive: true });
    }

    // Store session info
    sessionCache.set(sessionId, {
      sandboxId: sessionId,
      workDir,
      repoUrl: args.repoUrl,
      branch,
    });

    return {
      content: [{ type: 'text', text: `Session created: ${sessionId}` }],
      structuredContent: {
        sessionId,
        workDir,
        branch,
      },
    };
  }

  private async runClaude(args: {
    sessionId: string;
    task: string;
    context?: string;
    systemPrompt?: string;
    timeout: number;
  }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return this.errorContent(`Session not found: ${args.sessionId}`);
    }

    if (!this.credentials.anthropicApiKey) {
      return this.errorContent('Anthropic API key not configured');
    }

    const sandbox = getSandbox(this.sandboxBinding, session.sandboxId);

    // Build task instructions
    let taskContent = `# Task Instructions\n\n${args.task}`;
    if (args.context) {
      taskContent += `\n\n## Context\n\n${args.context}`;
    }
    taskContent += `\n\n## Working Directory\n${session.workDir}`;
    taskContent += '\n\n## Guidelines\n- Make minimal, focused changes\n- Follow existing code style\n- Do NOT commit changes';

    await sandbox.writeFile('/tmp/task.md', taskContent);

    const systemPrompt = args.systemPrompt ||
      'You are an automatic feature-implementer/bug-fixer. Apply all necessary changes to achieve the user request. Do NOT commit changes - the workflow will handle that.';

    // Escape the system prompt for shell
    const escapedSystemPrompt = systemPrompt.replace(/'/g, "'\\''");

    // Run Claude directly using execStream for better reliability
    // First check if claude is available
    const checkCmd = `command -v claude && echo "claude-available" || echo "claude-not-found"`;
    const checkStream = await sandbox.execStream(checkCmd);
    let claudeAvailable = false;
    for await (const event of parseSSEStream<ExecEvent>(checkStream)) {
      if (event.type === 'stdout' && event.data?.includes('claude-available')) {
        claudeAvailable = true;
      }
      if (event.type === 'complete') break;
    }

    if (!claudeAvailable) {
      // List what IS available to help debug
      const lsStream = await sandbox.execStream('ls -la /usr/local/bin 2>/dev/null; echo "---"; ls -la /usr/bin 2>/dev/null | head -20');
      let lsOutput = '';
      for await (const event of parseSSEStream<ExecEvent>(lsStream)) {
        if (event.type === 'stdout') lsOutput += event.data;
        if (event.type === 'complete') break;
      }
      return this.errorContent(`Claude CLI is not installed in the sandbox. Available in /usr/local/bin and /usr/bin:\n${lsOutput}`);
    }

    // Run Claude Code using the same approach as ExecutionWorkflow
    // Uses --permission-mode acceptEdits instead of --dangerously-skip-permissions
    // (the latter doesn't work when running as root in the sandbox)
    const claudeScript = `#!/bin/bash
cd ${session.workDir}
export ANTHROPIC_API_KEY="${this.credentials.anthropicApiKey}"
claude --append-system-prompt "${escapedSystemPrompt}" -p "$(cat /tmp/task.md)" --permission-mode acceptEdits > /tmp/claude-output.txt 2>&1
echo "---CLAUDE_EXIT_CODE:$?---" >> /tmp/claude-output.txt
`;

    await sandbox.writeFile('/tmp/run-claude.sh', claudeScript);

    logger.sandbox.info('Running Claude', { workDir: session.workDir });

    // Start Claude Code as a background process
    const claudeProcess = await sandbox.startProcess('bash /tmp/run-claude.sh');

    // Poll for completion (Claude can take several minutes)
    const timeoutSeconds = args.timeout;
    let complete = false;
    let attempts = 0;
    let output = '';
    let exitCode = 0;

    while (!complete && attempts < timeoutSeconds) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;

      try {
        const outputFile = await sandbox.readFile('/tmp/claude-output.txt');
        if (outputFile.content.includes('---CLAUDE_EXIT_CODE:')) {
          complete = true;
          output = outputFile.content;

          const exitCodeMatch = output.match(/---CLAUDE_EXIT_CODE:(\d+)---/);
          exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 1;
          output = output.replace(/---CLAUDE_EXIT_CODE:\d+---/, '').trim();
        }
      } catch {
        // File doesn't exist yet
      }
    }

    // Kill process if still running
    try {
      await sandbox.killProcess(claudeProcess.id);
    } catch {
      // Process may have already exited
    }

    logger.sandbox.info('Claude exited', { exitCode, outputLength: output.length });
    logger.sandbox.debug('Claude output preview', { output: output.slice(0, 500) });

    if (!complete) {
      return this.errorContent(`Claude Code timed out after ${timeoutSeconds} seconds`);
    }

    // Check for errors
    if (exitCode !== 0) {
      return this.errorContent(`Claude CLI failed with exit code ${exitCode}: ${output.slice(0, 1000)}`);
    }

    // Get list of modified files
    const statusStream = await sandbox.execStream(`cd ${session.workDir} && git status --porcelain`);
    let statusOutput = '';
    for await (const event of parseSSEStream<ExecEvent>(statusStream)) {
      if (event.type === 'stdout') {
        statusOutput += event.data;
      }
      if (event.type === 'complete') break;
    }

    const filesModified = statusOutput
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.slice(3).trim());

    return {
      content: [{ type: 'text', text: output.slice(0, 500) + (output.length > 500 ? '...' : '') }],
      structuredContent: {
        success: exitCode === 0,
        output,
        filesModified,
        exitCode,
      },
    };
  }

  private async getDiff(args: {
    sessionId: string;
    staged: boolean;
  }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return this.errorContent(`Session not found: ${args.sessionId}`);
    }

    const sandbox = getSandbox(this.sandboxBinding, session.sandboxId);

    // Stage all changes first to ensure we capture everything (excluding build artifacts)
    if (!args.staged) {
      const addStream = await sandbox.execStream(`cd ${session.workDir} && git add -A -- . ${GIT_ADD_EXCLUSIONS}`);
      for await (const event of parseSSEStream<ExecEvent>(addStream)) {
        if (event.type === 'complete') break;
      }
    }

    // Get diff
    const diffCmd = args.staged
      ? `cd ${session.workDir} && git diff --cached`
      : `cd ${session.workDir} && git diff HEAD`;

    const diffStream = await sandbox.execStream(diffCmd);
    let diff = '';
    for await (const event of parseSSEStream<ExecEvent>(diffStream)) {
      if (event.type === 'stdout') {
        diff += event.data;
      }
      if (event.type === 'complete') break;
    }

    // Calculate stats
    const files = (diff.match(/^diff --git/gm) || []).length;
    const additions = (diff.match(/^\+[^+]/gm) || []).length;
    const deletions = (diff.match(/^-[^-]/gm) || []).length;

    return {
      content: [{ type: 'text', text: `${files} files changed, +${additions}/-${deletions}. Use structuredContent.diff and structuredContent.stats for the approval request.` }],
      structuredContent: {
        diff,
        stats: { files, additions, deletions },
      },
    };
  }

  private async commit(args: {
    sessionId: string;
    message: string;
  }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return this.errorContent(`Session not found: ${args.sessionId}`);
    }

    const sandbox = getSandbox(this.sandboxBinding, session.sandboxId);

    // Stage all changes (excluding build artifacts)
    const addStream = await sandbox.execStream(`cd ${session.workDir} && git add -A -- . ${GIT_ADD_EXCLUSIONS}`);
    for await (const event of parseSSEStream<ExecEvent>(addStream)) {
      if (event.type === 'complete') break;
    }

    // Write commit message to file (avoids shell escaping issues)
    await sandbox.writeFile('/tmp/commit-msg.txt', args.message);

    // Commit
    const commitStream = await sandbox.execStream(
      `cd ${session.workDir} && git commit -F /tmp/commit-msg.txt`
    );

    let commitOutput = '';
    let exitCode = 0;
    for await (const event of parseSSEStream<ExecEvent>(commitStream)) {
      if (event.type === 'stdout') {
        commitOutput += event.data;
      }
      if (event.type === 'complete') {
        exitCode = event.exitCode || 0;
        break;
      }
    }

    if (exitCode !== 0) {
      return this.errorContent(`Commit failed: ${commitOutput}`);
    }

    // Get commit hash
    const hashStream = await sandbox.execStream(`cd ${session.workDir} && git rev-parse HEAD`);
    let commitHash = '';
    for await (const event of parseSSEStream<ExecEvent>(hashStream)) {
      if (event.type === 'stdout') {
        commitHash = event.data?.trim() || '';
      }
      if (event.type === 'complete') break;
    }

    return {
      content: [{ type: 'text', text: `Committed: ${commitHash.slice(0, 8)}` }],
      structuredContent: {
        success: true,
        commitHash,
      },
    };
  }

  private async push(args: {
    sessionId: string;
    remote: string;
    branch?: string;
    force: boolean;
  }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return this.errorContent(`Session not found: ${args.sessionId}`);
    }

    const sandbox = getSandbox(this.sandboxBinding, session.sandboxId);
    const remote = args.remote;
    const branch = args.branch || session.branch || 'main';
    const forceFlag = args.force ? ' --force' : '';

    const pushStream = await sandbox.execStream(
      `cd ${session.workDir} && git push${forceFlag} ${remote} HEAD:${branch}`
    );

    let pushOutput = '';
    let exitCode = 0;
    for await (const event of parseSSEStream<ExecEvent>(pushStream)) {
      if (event.type === 'stdout' || event.type === 'stderr') {
        pushOutput += event.data || '';
      }
      if (event.type === 'complete') {
        exitCode = event.exitCode || 0;
        break;
      }
    }

    if (exitCode !== 0) {
      return this.errorContent(`Push failed: ${pushOutput}`);
    }

    return {
      content: [{ type: 'text', text: `Pushed to ${remote}/${branch}` }],
      structuredContent: {
        success: true,
        ref: `${remote}/${branch}`,
      },
    };
  }

  private async readFile(args: {
    sessionId: string;
    path: string;
  }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return this.errorContent(`Session not found: ${args.sessionId}`);
    }

    const sandbox = getSandbox(this.sandboxBinding, session.sandboxId);
    const fullPath = args.path.startsWith('/') ? args.path : `${session.workDir}/${args.path}`;

    try {
      const file = await sandbox.readFile(fullPath);
      return {
        content: [{ type: 'text', text: file.content.slice(0, 1000) + (file.content.length > 1000 ? '...' : '') }],
        structuredContent: {
          content: file.content,
        },
      };
    } catch (error) {
      return this.errorContent(`Failed to read file: ${error}`);
    }
  }

  private async writeFile(args: {
    sessionId: string;
    path: string;
    content: string;
  }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return this.errorContent(`Session not found: ${args.sessionId}`);
    }

    const sandbox = getSandbox(this.sandboxBinding, session.sandboxId);
    const fullPath = args.path.startsWith('/') ? args.path : `${session.workDir}/${args.path}`;

    try {
      await sandbox.writeFile(fullPath, args.content);
      return {
        content: [{ type: 'text', text: `Wrote ${args.content.length} bytes to ${args.path}` }],
        structuredContent: {
          success: true,
          bytesWritten: args.content.length,
        },
      };
    } catch (error) {
      return this.errorContent(`Failed to write file: ${error}`);
    }
  }

  private async exec(args: {
    sessionId: string;
    command: string;
    cwd?: string;
    timeout: number;
  }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return this.errorContent(`Session not found: ${args.sessionId}`);
    }

    const sandbox = getSandbox(this.sandboxBinding, session.sandboxId);
    const cwd = args.cwd
      ? (args.cwd.startsWith('/') ? args.cwd : `${session.workDir}/${args.cwd}`)
      : session.workDir;

    const execStream = await sandbox.execStream(`cd ${cwd} && ${args.command}`);

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    for await (const event of parseSSEStream<ExecEvent>(execStream)) {
      if (event.type === 'stdout') {
        stdout += event.data || '';
      }
      if (event.type === 'stderr') {
        stderr += event.data || '';
      }
      if (event.type === 'complete') {
        exitCode = event.exitCode || 0;
        break;
      }
      if (event.type === 'error') {
        return this.errorContent(`Exec error: ${event.error}`);
      }
    }

    return {
      content: [{ type: 'text', text: stdout.slice(0, 500) || stderr.slice(0, 500) || `Exit code: ${exitCode}` }],
      structuredContent: {
        stdout,
        stderr,
        exitCode,
      },
    };
  }

  private async destroySession(args: { sessionId: string }): Promise<MCPToolCallResult> {
    const session = sessionCache.get(args.sessionId);
    if (!session) {
      return {
        content: [{ type: 'text', text: 'Session not found (may already be destroyed)' }],
        structuredContent: { success: true },
      };
    }

    // Remove from cache
    sessionCache.delete(args.sessionId);

    // Note: The sandbox will be automatically cleaned up by Cloudflare
    // after it's no longer referenced

    return {
      content: [{ type: 'text', text: `Session ${args.sessionId} destroyed` }],
      structuredContent: { success: true },
    };
  }
}
