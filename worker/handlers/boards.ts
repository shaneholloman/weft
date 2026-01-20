/**
 * Board-scoped route handlers
 */

import { jsonResponse } from '../utils/response';
import { handleGeneratePlan, handleResolveCheckpoint, handleCancelWorkflow } from './workflows';
import type { BoardDO } from '../BoardDO';
import type { UserDO } from '../UserDO';
import type { AuthUser } from '../auth';

type BoardDOStub = DurableObjectStub<BoardDO>;
type UserDOStub = DurableObjectStub<UserDO>;

/**
 * Route board-scoped requests to appropriate RPC methods
 */
export async function routeBoardRequest(
  request: Request,
  boardStub: BoardDOStub,
  userStub: UserDOStub,
  boardId: string,
  subPath: string,
  env: Env,
  _user: AuthUser
): Promise<Response> {
  const method = request.method;

  // GET /api/boards/:id - Get board
  if (!subPath && method === 'GET') {
    try {
      const board = await boardStub.getBoard(boardId);
      return jsonResponse({ success: true, data: board });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Board not found' },
      }, 404);
    }
  }

  // PUT /api/boards/:id - Update board
  if (!subPath && method === 'PUT') {
    const data = await request.json() as { name?: string };
    try {
      const board = await boardStub.updateBoard(boardId, data);
      // Also update UserDO's board list if name changed
      if (data.name) {
        await userStub.updateBoardName(boardId, data.name);
      }
      return jsonResponse({ success: true, data: board });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update board' },
      }, 500);
    }
  }

  // DELETE /api/boards/:id - Delete board
  if (!subPath && method === 'DELETE') {
    try {
      await boardStub.deleteBoard(boardId);
      await userStub.removeBoard(boardId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete board' },
      }, 500);
    }
  }

  // ============================================
  // COLUMN ROUTES
  // ============================================

  // POST /api/boards/:id/columns - Create column
  const createColumnMatch = subPath === '/columns' && method === 'POST';
  if (createColumnMatch) {
    const data = await request.json() as { name: string };
    try {
      const column = await boardStub.createColumn(boardId, data);
      return jsonResponse({ success: true, data: column });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create column' },
      }, 500);
    }
  }

  // PUT /api/boards/:id/columns/:columnId - Update column
  const updateColumnMatch = subPath.match(/^\/columns\/([^/]+)$/);
  if (updateColumnMatch && method === 'PUT') {
    const columnId = updateColumnMatch[1];
    const data = await request.json() as { name?: string; position?: number };
    try {
      const column = await boardStub.updateColumn(columnId, data);
      return jsonResponse({ success: true, data: column });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update column' },
      }, 500);
    }
  }

  // DELETE /api/boards/:id/columns/:columnId - Delete column
  if (updateColumnMatch && method === 'DELETE') {
    const columnId = updateColumnMatch[1];
    try {
      await boardStub.deleteColumn(columnId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete column' },
      }, 500);
    }
  }

  // ============================================
  // TASK ROUTES
  // ============================================

  // POST /api/boards/:id/tasks - Create task
  if (subPath === '/tasks' && method === 'POST') {
    const data = await request.json() as { columnId: string; title: string; description?: string; priority?: string; context?: object };
    try {
      const task = await boardStub.createTask({ ...data, boardId });
      return jsonResponse({ success: true, data: task });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create task' },
      }, 500);
    }
  }

  // GET /api/boards/:id/tasks/:taskId - Get task
  const taskMatch = subPath.match(/^\/tasks\/([^/]+)$/);
  if (taskMatch && method === 'GET') {
    const taskId = taskMatch[1];
    try {
      const task = await boardStub.getTask(taskId);
      return jsonResponse({ success: true, data: task });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Task not found' },
      }, 404);
    }
  }

  // PUT /api/boards/:id/tasks/:taskId - Update task
  if (taskMatch && method === 'PUT') {
    const taskId = taskMatch[1];
    const data = await request.json() as { title?: string; description?: string; priority?: string; context?: object; scheduleConfig?: object | null };
    try {
      const task = await boardStub.updateTask(taskId, data);
      return jsonResponse({ success: true, data: task });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update task' },
      }, 500);
    }
  }

  // DELETE /api/boards/:id/tasks/:taskId - Delete task
  if (taskMatch && method === 'DELETE') {
    const taskId = taskMatch[1];
    try {
      await boardStub.deleteTask(taskId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete task' },
      }, 500);
    }
  }

  // POST /api/boards/:id/tasks/:taskId/move - Move task
  const moveTaskMatch = subPath.match(/^\/tasks\/([^/]+)\/move$/);
  if (moveTaskMatch && method === 'POST') {
    const taskId = moveTaskMatch[1];
    const data = await request.json() as { columnId: string; position: number };
    try {
      const task = await boardStub.moveTask(taskId, data);
      return jsonResponse({ success: true, data: task });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'MOVE_FAILED', message: error instanceof Error ? error.message : 'Failed to move task' },
      }, 500);
    }
  }

  // POST /api/boards/:id/tasks/:taskId/generate-plan - Generate plan (special handler)
  const generatePlanMatch = subPath.match(/^\/tasks\/([^/]+)\/generate-plan$/);
  if (generatePlanMatch && method === 'POST') {
    return handleGeneratePlan(env, boardStub, boardId, generatePlanMatch[1]);
  }

  // GET /api/boards/:id/tasks/:taskId/plan - Get task workflow plan
  const taskPlanMatch = subPath.match(/^\/tasks\/([^/]+)\/plan$/);
  if (taskPlanMatch && method === 'GET') {
    const taskId = taskPlanMatch[1];
    try {
      const plan = await boardStub.getTaskWorkflowPlan(taskId);
      return jsonResponse({ success: true, data: plan });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Plan not found' },
      }, 404);
    }
  }

  // POST /api/boards/:id/tasks/:taskId/plan - Create workflow plan
  if (taskPlanMatch && method === 'POST') {
    const taskId = taskPlanMatch[1];
    const data = await request.json() as { id?: string; summary?: string; generatedCode?: string; steps?: object[] };
    try {
      const plan = await boardStub.createWorkflowPlan(taskId, { ...data, boardId });
      return jsonResponse({ success: true, data: plan });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create plan' },
      }, 500);
    }
  }

  // ============================================
  // SCHEDULED TASK ROUTES
  // ============================================

  // GET /api/boards/:id/scheduled-tasks - Get all scheduled tasks for board
  if (subPath === '/scheduled-tasks' && method === 'GET') {
    try {
      const tasks = await boardStub.getScheduledTasks(boardId);
      return jsonResponse({ success: true, data: tasks });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to get scheduled tasks' },
      }, 500);
    }
  }

  // GET /api/boards/:id/tasks/:taskId/runs - Get scheduled runs for a task
  const taskRunsMatch = subPath.match(/^\/tasks\/([^/]+)\/runs$/);
  if (taskRunsMatch && method === 'GET') {
    const taskId = taskRunsMatch[1];
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    try {
      const runs = await boardStub.getScheduledRuns(taskId, limit);
      return jsonResponse({ success: true, data: runs });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to get scheduled runs' },
      }, 500);
    }
  }

  // POST /api/boards/:id/tasks/:taskId/run - Trigger a scheduled run manually
  const triggerRunMatch = subPath.match(/^\/tasks\/([^/]+)\/run$/);
  if (triggerRunMatch && method === 'POST') {
    const taskId = triggerRunMatch[1];
    try {
      const result = await boardStub.triggerScheduledRun(taskId);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'TRIGGER_FAILED', message: error instanceof Error ? error.message : 'Failed to trigger scheduled run' },
      }, 500);
    }
  }

  // GET /api/boards/:id/runs/:runId/tasks - Get child tasks for a scheduled run
  const runTasksMatch = subPath.match(/^\/runs\/([^/]+)\/tasks$/);
  if (runTasksMatch && method === 'GET') {
    const runId = runTasksMatch[1];
    try {
      const tasks = await boardStub.getRunTasks(runId);
      return jsonResponse({ success: true, data: tasks });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to get run tasks' },
      }, 500);
    }
  }

  // DELETE /api/boards/:id/runs/:runId - Delete a scheduled run from history
  const runDeleteMatch = subPath.match(/^\/runs\/([^/]+)$/);
  if (runDeleteMatch && method === 'DELETE') {
    const runId = runDeleteMatch[1];
    try {
      await boardStub.deleteScheduledRun(runId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete run' },
      }, 500);
    }
  }

  // GET /api/boards/:id/tasks/:taskId/children - Get child tasks for a parent scheduled task
  const childTasksMatch = subPath.match(/^\/tasks\/([^/]+)\/children$/);
  if (childTasksMatch && method === 'GET') {
    const parentTaskId = childTasksMatch[1];
    try {
      const tasks = await boardStub.getChildTasks(parentTaskId);
      return jsonResponse({ success: true, data: tasks });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to get child tasks' },
      }, 500);
    }
  }

  // ============================================
  // WORKFLOW PLAN ROUTES
  // ============================================

  // GET /api/boards/:id/workflow-plans - Get all workflow plans for board
  if (subPath === '/workflow-plans' && method === 'GET') {
    try {
      const plans = await boardStub.getBoardWorkflowPlans(boardId);
      return jsonResponse({ success: true, data: plans });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to get workflow plans' },
      }, 500);
    }
  }

  // GET /api/boards/:id/plans/:planId - Get workflow plan
  const planMatch = subPath.match(/^\/plans\/([^/]+)$/);
  if (planMatch && method === 'GET') {
    const planId = planMatch[1];
    try {
      const plan = await boardStub.getWorkflowPlan(planId);
      return jsonResponse({ success: true, data: plan });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Plan not found' },
      }, 404);
    }
  }

  // PUT /api/boards/:id/plans/:planId - Update workflow plan
  if (planMatch && method === 'PUT') {
    const planId = planMatch[1];
    const data = await request.json() as { status?: string; summary?: string; generatedCode?: string; steps?: object[]; currentStepIndex?: number; checkpointData?: object; result?: object };
    try {
      const plan = await boardStub.updateWorkflowPlan(planId, data);
      return jsonResponse({ success: true, data: plan });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update plan' },
      }, 500);
    }
  }

  // DELETE /api/boards/:id/plans/:planId - Delete workflow plan
  if (planMatch && method === 'DELETE') {
    const planId = planMatch[1];
    try {
      await boardStub.deleteWorkflowPlan(planId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete plan' },
      }, 500);
    }
  }

  // POST /api/boards/:id/plans/:planId/approve - Approve workflow plan
  const approvePlanMatch = subPath.match(/^\/plans\/([^/]+)\/approve$/);
  if (approvePlanMatch && method === 'POST') {
    const planId = approvePlanMatch[1];
    try {
      const plan = await boardStub.approveWorkflowPlan(planId);
      return jsonResponse({ success: true, data: plan });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'APPROVE_FAILED', message: error instanceof Error ? error.message : 'Failed to approve plan' },
      }, 500);
    }
  }

  // POST /api/boards/:id/plans/:planId/checkpoint - Resolve checkpoint
  const checkpointMatch = subPath.match(/^\/plans\/([^/]+)\/checkpoint$/);
  if (checkpointMatch && method === 'POST') {
    return handleResolveCheckpoint(request, env, boardStub, boardId, checkpointMatch[1]);
  }

  // POST /api/boards/:id/plans/:planId/cancel - Cancel workflow
  const cancelMatch = subPath.match(/^\/plans\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    return handleCancelWorkflow(env, boardStub, boardId, cancelMatch[1]);
  }

  // GET /api/boards/:id/plans/:planId/logs - Get workflow logs
  const logsMatch = subPath.match(/^\/plans\/([^/]+)\/logs$/);
  if (logsMatch && method === 'GET') {
    const planId = logsMatch[1];
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined;
    const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined;
    try {
      const logs = await boardStub.getWorkflowLogs(planId, limit, offset);
      return jsonResponse({ success: true, data: logs });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Logs not found' },
      }, 404);
    }
  }

  // ============================================
  // CREDENTIAL ROUTES
  // ============================================

  // GET /api/boards/:id/credentials - Get credentials
  if (subPath === '/credentials' && method === 'GET') {
    try {
      const credentials = await boardStub.getCredentials(boardId);
      return jsonResponse({ success: true, data: credentials });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Failed to get credentials' },
      }, 500);
    }
  }

  // POST /api/boards/:id/credentials - Create credential
  if (subPath === '/credentials' && method === 'POST') {
    const data = await request.json() as { type: string; name: string; value: string; metadata?: object };
    try {
      const credential = await boardStub.createCredential(boardId, data);
      return jsonResponse({ success: true, data: credential });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create credential' },
      }, 500);
    }
  }

  // GET /api/boards/:id/credentials/type/:type/value - Get credential value
  const credentialValueMatch = subPath.match(/^\/credentials\/type\/([^/]+)\/value$/);
  if (credentialValueMatch && method === 'GET') {
    const type = credentialValueMatch[1];
    try {
      const value = await boardStub.getCredentialValue(boardId, type);
      return jsonResponse({ success: true, data: { value } });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Credential not found' },
      }, 404);
    }
  }

  // GET /api/boards/:id/credentials/type/:type/full - Get credential with metadata
  const credentialFullMatch = subPath.match(/^\/credentials\/type\/([^/]+)\/full$/);
  if (credentialFullMatch && method === 'GET') {
    const type = credentialFullMatch[1];
    try {
      const data = await boardStub.getCredentialFull(boardId, type);
      return jsonResponse({ success: true, data });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Credential not found' },
      }, 404);
    }
  }

  // PUT /api/boards/:id/credentials/type/:type - Update credential value
  const credentialTypeMatch = subPath.match(/^\/credentials\/type\/([^/]+)$/);
  if (credentialTypeMatch && method === 'PUT') {
    const type = credentialTypeMatch[1];
    const data = await request.json() as { value: string; metadata?: Record<string, unknown> };
    try {
      const result = await boardStub.updateCredentialValue(boardId, type, data.value, data.metadata);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update credential' },
      }, 500);
    }
  }

  // DELETE /api/boards/:id/credentials/:credentialId - Delete credential
  const deleteCredentialMatch = subPath.match(/^\/credentials\/([^/]+)$/);
  if (deleteCredentialMatch && method === 'DELETE') {
    const credentialId = deleteCredentialMatch[1];
    try {
      await boardStub.deleteCredential(boardId, credentialId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete credential' },
      }, 500);
    }
  }

  // ============================================
  // MCP SERVER ROUTES
  // ============================================

  // GET /api/boards/:id/mcp-servers - Get MCP servers
  if (subPath === '/mcp-servers' && method === 'GET') {
    try {
      const servers = await boardStub.getMCPServers(boardId);
      return jsonResponse({ success: true, data: servers });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Failed to get MCP servers' },
      }, 500);
    }
  }

  // POST /api/boards/:id/mcp-servers - Create MCP server
  if (subPath === '/mcp-servers' && method === 'POST') {
    const data = await request.json() as {
      name: string;
      type: 'remote' | 'hosted';
      endpoint?: string;
      authType?: string;
      credentialId?: string;
      status?: string;
      transportType?: 'streamable-http' | 'sse';
      urlPatterns?: Array<{ pattern: string; type: string; fetchTool: string }>;
    };
    try {
      const server = await boardStub.createMCPServer(boardId, data);
      return jsonResponse({ success: true, data: server });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create MCP server' },
      }, 500);
    }
  }

  // POST /api/boards/:id/mcp-servers/account - Create account-based MCP
  if (subPath === '/mcp-servers/account' && method === 'POST') {
    const data = await request.json() as { accountId: string; mcpId: string };
    try {
      const server = await boardStub.createAccountMCP(boardId, data);
      return jsonResponse({ success: true, data: server });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create account MCP' },
      }, 500);
    }
  }

  // GET /api/boards/:id/mcp-servers/:serverId - Get MCP server
  const mcpServerMatch = subPath.match(/^\/mcp-servers\/([^/]+)$/);
  if (mcpServerMatch && method === 'GET') {
    const serverId = mcpServerMatch[1];
    try {
      const server = await boardStub.getMCPServer(serverId);
      return jsonResponse({ success: true, data: server });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'MCP server not found' },
      }, 404);
    }
  }

  // PUT /api/boards/:id/mcp-servers/:serverId - Update MCP server
  if (mcpServerMatch && method === 'PUT') {
    const serverId = mcpServerMatch[1];
    const data = await request.json() as {
      name?: string;
      endpoint?: string;
      authType?: string;
      credentialId?: string;
      enabled?: boolean;
      status?: string;
      transportType?: 'streamable-http' | 'sse';
    };
    try {
      const server = await boardStub.updateMCPServer(serverId, data);
      return jsonResponse({ success: true, data: server });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update MCP server' },
      }, 500);
    }
  }

  // DELETE /api/boards/:id/mcp-servers/:serverId - Delete MCP server
  if (mcpServerMatch && method === 'DELETE') {
    const serverId = mcpServerMatch[1];
    try {
      await boardStub.deleteMCPServer(serverId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed to delete MCP server' },
      }, 500);
    }
  }

  // GET /api/boards/:id/mcp-servers/:serverId/tools - Get MCP server tools
  const mcpToolsMatch = subPath.match(/^\/mcp-servers\/([^/]+)\/tools$/);
  if (mcpToolsMatch && method === 'GET') {
    const serverId = mcpToolsMatch[1];
    try {
      const tools = await boardStub.getMCPServerTools(serverId);
      return jsonResponse({ success: true, data: tools });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Failed to get MCP tools' },
      }, 500);
    }
  }

  // PUT/POST /api/boards/:id/mcp-servers/:serverId/tools - Cache MCP server tools
  if (mcpToolsMatch && (method === 'PUT' || method === 'POST')) {
    const serverId = mcpToolsMatch[1];
    const data = await request.json() as {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: object;
        approvalRequiredFields?: string[];
      }>;
    };
    try {
      const tools = await boardStub.cacheMCPServerTools(serverId, data);
      return jsonResponse({ success: true, data: tools });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CACHE_FAILED', message: error instanceof Error ? error.message : 'Failed to cache MCP tools' },
      }, 500);
    }
  }

  // POST /api/boards/:id/mcp-servers/:serverId/connect - Connect MCP server
  const mcpConnectMatch = subPath.match(/^\/mcp-servers\/([^/]+)\/connect$/);
  if (mcpConnectMatch && method === 'POST') {
    const serverId = mcpConnectMatch[1];
    try {
      const result = await boardStub.connectMCPServer(serverId);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'CONNECT_FAILED', message: error instanceof Error ? error.message : 'Failed to connect MCP server' },
      }, 500);
    }
  }

  // POST /api/boards/:id/mcp-servers/:serverId/oauth/discover - Discover OAuth
  const mcpOAuthDiscoverMatch = subPath.match(/^\/mcp-servers\/([^/]+)\/oauth\/discover$/);
  if (mcpOAuthDiscoverMatch && method === 'POST') {
    const serverId = mcpOAuthDiscoverMatch[1];
    try {
      const result = await boardStub.discoverMCPOAuth(serverId);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'DISCOVER_FAILED', message: error instanceof Error ? error.message : 'OAuth discovery failed' },
      }, 500);
    }
  }

  // GET /api/boards/:id/mcp-servers/:serverId/oauth/url - Get OAuth URL
  const mcpOAuthUrlMatch = subPath.match(/^\/mcp-servers\/([^/]+)\/oauth\/url$/);
  if (mcpOAuthUrlMatch && method === 'GET') {
    const serverId = mcpOAuthUrlMatch[1];
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get('redirectUri');
    if (!redirectUri) {
      return jsonResponse({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'redirectUri is required' },
      }, 400);
    }
    try {
      const result = await boardStub.getMCPOAuthUrl(serverId, redirectUri);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'URL_FAILED', message: error instanceof Error ? error.message : 'Failed to get OAuth URL' },
      }, 500);
    }
  }

  // POST /api/boards/:id/mcp-servers/:serverId/oauth/exchange - Exchange OAuth code
  const mcpOAuthExchangeMatch = subPath.match(/^\/mcp-servers\/([^/]+)\/oauth\/exchange$/);
  if (mcpOAuthExchangeMatch && method === 'POST') {
    const serverId = mcpOAuthExchangeMatch[1];
    const data = await request.json() as { code: string; state: string; redirectUri: string };
    try {
      const result = await boardStub.exchangeMCPOAuthCode(serverId, data);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'EXCHANGE_FAILED', message: error instanceof Error ? error.message : 'OAuth exchange failed' },
      }, 500);
    }
  }

  // ============================================
  // GITHUB ROUTES
  // ============================================

  // GET /api/boards/:id/github/repos - Get GitHub repos
  if (subPath === '/github/repos' && method === 'GET') {
    try {
      const repos = await boardStub.getGitHubRepos(boardId);
      return jsonResponse({ success: true, data: repos });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to get GitHub repos' },
      }, 500);
    }
  }

  // ============================================
  // LINK METADATA ROUTES
  // ============================================

  // POST /api/boards/:id/links/metadata - Get link metadata
  if (subPath === '/links/metadata' && method === 'POST') {
    const data = await request.json() as { url: string };
    try {
      const metadata = await boardStub.getLinkMetadata(boardId, data);
      return jsonResponse({ success: true, data: metadata });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to get link metadata' },
      }, 500);
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
