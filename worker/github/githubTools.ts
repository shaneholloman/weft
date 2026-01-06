/**
 * GitHub MCP Tool Definitions
 *
 * Single source of truth for GitHub tool schemas using Zod.
 * Used for both JSON Schema generation (getTools) and runtime validation (callTool).
 *
 * Note: Tool names use snake_case to match GitHub API conventions
 */

import { z } from 'zod';
import { defineTools, commonSchemas } from '../utils/zodTools';

// ============================================================================
// Output Schemas
// ============================================================================

const fileContentOutput = z.object({
  content: z.string().describe('File contents (decoded)'),
  sha: z.string().describe('File SHA (needed for updates)'),
  size: z.number().describe('File size in bytes'),
  path: z.string().describe('File path'),
});

const branchOutput = z.object({
  ref: z.string().describe('Full ref path (refs/heads/branch-name)'),
  sha: z.string().describe('Commit SHA the branch points to'),
});

const pullRequestOutput = z.object({
  number: z.number().describe('Pull request number'),
  url: z.string().describe('URL to the pull request'),
  state: z.string().describe('Pull request state'),
  title: z.string().describe('Pull request title'),
});

const issueOutput = z.object({
  number: z.number().describe('Issue number'),
  title: z.string().describe('Issue title'),
  state: z.string().describe('Issue state'),
  url: z.string().describe('URL to the issue'),
  labels: z.array(z.string()).optional().describe('Issue labels'),
});

const issueDetailOutput = z.object({
  number: z.number().describe('Issue number'),
  title: z.string().describe('Issue title'),
  state: z.string().describe('Issue state'),
  body: z.string().describe('Issue body'),
  url: z.string().describe('URL to the issue'),
});

const prDetailOutput = z.object({
  number: z.number().describe('PR number'),
  title: z.string().describe('PR title'),
  state: z.string().describe('PR state'),
  body: z.string().describe('PR body'),
  url: z.string().describe('URL to the PR'),
});

const repoOutput = z.object({
  full_name: z.string().describe('Full repo name (owner/repo)'),
  name: z.string().describe('Repository name'),
  owner: z.string().describe('Repository owner'),
  description: z.string().describe('Repository description'),
  private: z.boolean().describe('Whether repo is private'),
  url: z.string().describe('URL to the repository'),
  default_branch: z.string().optional().describe('Default branch name'),
  stars: z.number().optional().describe('Number of stars'),
  forks: z.number().optional().describe('Number of forks'),
});

const repoListItemOutput = z.object({
  full_name: z.string().describe('Full repo name (owner/repo)'),
  name: z.string().describe('Repository name'),
  owner: z.string().describe('Repository owner'),
  description: z.string().describe('Repository description'),
  private: z.boolean().describe('Whether repo is private'),
  url: z.string().describe('URL to the repository'),
});

// ============================================================================
// Tool Definitions
// ============================================================================

export const githubTools = defineTools({
  read_file: {
    description: 'Read the contents of a file from a GitHub repository',
    input: z.object({
      owner: commonSchemas.owner,
      repo: commonSchemas.repo,
      path: commonSchemas.filePath.describe('Path to the file in the repository'),
      ref: commonSchemas.gitRef.default('main')
        .describe('Branch, tag, or commit SHA (default: main)'),
    }),
    output: fileContentOutput,
  },

  create_branch: {
    description: 'Create a new branch in a GitHub repository',
    input: z.object({
      owner: commonSchemas.owner,
      repo: commonSchemas.repo,
      branch: commonSchemas.branch.describe('Name of the new branch'),
      from: commonSchemas.gitRef.default('main')
        .describe('Source branch to create from (default: main)'),
    }),
    output: branchOutput,
  },

  create_pr: {
    description: 'Create a pull request in a GitHub repository',
    input: z.object({
      owner: commonSchemas.owner,
      repo: commonSchemas.repo,
      title: z.string().max(500).describe('Pull request title'),
      body: z.string().max(65000).default('')
        .describe('Pull request description'),
      head: commonSchemas.branch.describe('Source branch containing the changes'),
      base: commonSchemas.gitRef.default('main')
        .describe('Target branch to merge into (default: main)'),
    }),
    output: pullRequestOutput,
    approvalRequiredFields: ['owner', 'repo', 'title', 'body', 'diff'],
  },

  list_issues: {
    description: 'List issues in a GitHub repository',
    input: z.object({
      owner: commonSchemas.owner,
      repo: commonSchemas.repo,
      state: z.enum(['open', 'closed', 'all']).default('open')
        .describe('Filter by issue state (default: open)'),
      labels: z.string().max(500).optional()
        .describe('Comma-separated list of label names'),
      per_page: z.coerce.number().int().min(1).max(100).default(30)
        .describe('Number of results per page (default: 30, max: 100)'),
    }),
    output: z.array(issueOutput),
  },

  get_issue: {
    description: 'Get details of a specific issue by number',
    input: z.object({
      owner: commonSchemas.owner,
      repo: commonSchemas.repo,
      issue_number: z.coerce.number().int().positive()
        .describe('Issue number'),
    }),
    output: issueDetailOutput,
  },

  get_pull_request: {
    description: 'Get details of a specific pull request by number',
    input: z.object({
      owner: commonSchemas.owner,
      repo: commonSchemas.repo,
      pull_number: z.coerce.number().int().positive()
        .describe('Pull request number'),
    }),
    output: prDetailOutput,
  },

  get_repository: {
    description: 'Get details of a specific repository',
    input: z.object({
      owner: commonSchemas.owner,
      repo: commonSchemas.repo,
    }),
    output: repoOutput,
  },

  list_repos: {
    description: 'List repositories accessible to the authenticated user. Call this first to discover available repositories before using other tools.',
    input: z.object({
      type: z.enum(['all', 'owner', 'public', 'private', 'member']).default('all')
        .describe('Filter by repo type (default: all)'),
      sort: z.enum(['created', 'updated', 'pushed', 'full_name']).default('full_name')
        .describe('Sort field (default: full_name)'),
      per_page: z.coerce.number().int().min(1).max(100).default(30)
        .describe('Number of results per page (default: 30, max: 100)'),
    }),
    output: z.array(repoListItemOutput),
  },
});

// Export type for tool names
export type GitHubToolName = keyof typeof githubTools;
