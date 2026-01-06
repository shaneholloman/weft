// GitHub OAuth Configuration
// Requires secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

export interface GitHubEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  private: boolean;
  default_branch: string;
  description: string | null;
}

// Scopes needed for repo access
const GITHUB_SCOPES = ['repo', 'read:user'];

/**
 * Generate the GitHub OAuth authorization URL
 */
export function getOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES.join(' '),
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GitHubTokenResponse> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const data = await response.json() as GitHubTokenResponse & { error?: string };

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error}`);
  }

  return data;
}

/**
 * Get the authenticated user's profile
 */
export async function getUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Weft-App',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get GitHub user: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
}

/**
 * List repositories accessible to the user
 */
export async function listRepos(
  accessToken: string,
  page = 1,
  perPage = 30
): Promise<GitHubRepo[]> {
  const params = new URLSearchParams({
    sort: 'updated',
    direction: 'desc',
    per_page: String(perPage),
    page: String(page),
  });

  const response = await fetch(
    `https://api.github.com/user/repos?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Weft-App',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list GitHub repos: ${response.status}`);
  }

  return response.json() as Promise<GitHubRepo[]>;
}

/**
 * Generate a random state string for OAuth
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
