/**
 * Cloudflare Worker entry point - thin dispatcher
 */

import { Sandbox } from '@cloudflare/sandbox';
import { AgentWorkflow } from './workflows/AgentWorkflow';
import { getAuthenticatedUser, getLogoutUrl, type AuthEnv } from './auth';
import { jsonResponse } from './utils/response';
import { logger } from './utils/logger';
import {
  handleGitHubOAuthUrl,
  handleGitHubOAuthExchange,
  handleGitHubOAuthCallback,
  handleGoogleOAuthUrl,
  handleGoogleOAuthExchange,
} from './handlers/oauth';
import { routeBoardRequest } from './handlers/boards';
import type { BoardDO } from './BoardDO';
import type { UserDO } from './UserDO';

export { BoardDO } from './BoardDO';
export { UserDO } from './UserDO';
export { Sandbox };
export { AgentWorkflow };

// Type for DO stubs with RPC methods
type BoardDOStub = DurableObjectStub<BoardDO>;
type UserDOStub = DurableObjectStub<UserDO>;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    logger.worker.debug('Incoming request', { method: request.method, path: url.pathname });

    // ============================================
    // PUBLIC ROUTES (no auth required)
    // ============================================

    // GitHub OAuth routes
    if (url.pathname === '/api/github/oauth/url') {
      return handleGitHubOAuthUrl(request, env, url);
    }

    if (url.pathname === '/api/github/oauth/exchange') {
      return handleGitHubOAuthExchange(request, env, url);
    }

    // Legacy callback route (for direct browser navigation)
    if (url.pathname === '/api/github/oauth/callback') {
      return handleGitHubOAuthCallback(request, env, url);
    }

    // Google OAuth routes
    if (url.pathname === '/api/google/oauth/url') {
      return handleGoogleOAuthUrl(request, env, url);
    }

    if (url.pathname === '/api/google/oauth/exchange') {
      return handleGoogleOAuthExchange(request, env, url);
    }

    // ============================================
    // PROTECTED ROUTES (auth required)
    // ============================================

    if (url.pathname.startsWith('/api/')) {
      // Authenticate user
      const user = await getAuthenticatedUser(request, env as unknown as AuthEnv);
      if (!user) {
        return jsonResponse({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        }, 401);
      }

      // Get UserDO stub with RPC
      const userDoId = env.USER_DO.idFromName(user.id);
      const userStub = env.USER_DO.get(userDoId) as UserDOStub;

      // Initialize user in UserDO (creates if new, updates email if changed)
      await userStub.initUser(user.id, user.email);

      // GET /api/me - Return current user info
      if (url.pathname === '/api/me' && request.method === 'GET') {
        return jsonResponse({
          success: true,
          data: {
            id: user.id,
            email: user.email,
            logoutUrl: (env as AuthEnv).AUTH_MODE === 'access' && (env as AuthEnv).ACCESS_TEAM ? getLogoutUrl((env as AuthEnv).ACCESS_TEAM!) : null,
          },
        });
      }

      // GET /api/boards - List user's boards (from UserDO)
      if (url.pathname === '/api/boards' && request.method === 'GET') {
        const boards = await userStub.getBoards();
        return jsonResponse({ success: true, data: boards });
      }

      // POST /api/boards - Create a new board
      if (url.pathname === '/api/boards' && request.method === 'POST') {
        const data = await request.json() as { name: string };
        const boardId = crypto.randomUUID();

        // Initialize BoardDO for this board
        const boardDoId = env.BOARD_DO.idFromName(boardId);
        const boardStub = env.BOARD_DO.get(boardDoId) as BoardDOStub;

        try {
          const board = await boardStub.initBoard({ id: boardId, name: data.name, ownerId: user.id });
          // Add board to user's list
          await userStub.addBoard(boardId, data.name, 'owner');
          return jsonResponse({ success: true, data: board });
        } catch (error) {
          return jsonResponse({
            success: false,
            error: { code: 'INIT_FAILED', message: error instanceof Error ? error.message : 'Failed to create board' },
          }, 500);
        }
      }

      // Board-specific routes - extract boardId and verify access
      const boardMatch = url.pathname.match(/^\/api\/boards\/([^/]+)(\/.*)?$/);
      if (boardMatch) {
        const boardId = boardMatch[1];
        const subPath = boardMatch[2] || '';

        // Check user has access to this board
        const accessResult = await userStub.hasAccess(boardId);

        if (!accessResult.hasAccess) {
          return jsonResponse({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied to this board' },
          }, 403);
        }

        // Get BoardDO stub with RPC
        const boardDoId = env.BOARD_DO.idFromName(boardId);
        const boardStub = env.BOARD_DO.get(boardDoId) as BoardDOStub;

        // Route to board handler
        return routeBoardRequest(request, boardStub, userStub, boardId, subPath, env, user);
      }

      // WebSocket upgrade route - forward to BoardDO (still uses fetch)
      if (url.pathname === '/api/ws' && request.headers.get('Upgrade') === 'websocket') {
        const boardId = url.searchParams.get('boardId');
        if (!boardId) {
          return jsonResponse({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'boardId is required for WebSocket' },
          }, 400);
        }

        // Check access
        const accessResult = await userStub.hasAccess(boardId);

        if (!accessResult.hasAccess) {
          return jsonResponse({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied to this board' },
          }, 403);
        }

        const boardDoId = env.BOARD_DO.idFromName(boardId);
        const boardStub = env.BOARD_DO.get(boardDoId);

        const doUrl = new URL(request.url);
        doUrl.pathname = '/ws';

        // WebSocket upgrade requires fetch (can't use RPC)
        return boardStub.fetch(new Request(doUrl.toString(), {
          method: request.method,
          headers: request.headers,
        }));
      }

      // POST /api/tasks - Create task (boardId in body)
      if (url.pathname === '/api/tasks' && request.method === 'POST') {
        const body = await request.json() as { boardId: string; columnId: string; title: string; description?: string; priority?: string; context?: object };
        if (!body.boardId) {
          return jsonResponse({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'boardId is required' },
          }, 400);
        }

        // Verify user has access to this board
        const accessResult = await userStub.hasAccess(body.boardId);

        if (!accessResult.hasAccess) {
          return jsonResponse({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied to this board' },
          }, 403);
        }

        // Route to the correct BoardDO
        const boardDoId = env.BOARD_DO.idFromName(body.boardId);
        const boardStub = env.BOARD_DO.get(boardDoId) as BoardDOStub;

        try {
          const task = await boardStub.createTask(body);
          return jsonResponse({ success: true, data: task });
        } catch (error) {
          return jsonResponse({
            success: false,
            error: { code: 'CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create task' },
          }, 500);
        }
      }

      return jsonResponse({ error: 'Not found' }, 404);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
