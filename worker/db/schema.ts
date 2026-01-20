/**
 * Database schema initialization and migrations for BoardDO
 */

export function initSchema(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      tool_config TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      position INTEGER NOT NULL,
      context TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    -- Board credentials (encrypted OAuth tokens, API keys)
    CREATE TABLE IF NOT EXISTS board_credentials (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(board_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_board ON board_credentials(board_id);

    -- MCP Server configurations
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      endpoint TEXT,
      auth_type TEXT NOT NULL DEFAULT 'none',
      credential_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'disconnected',
      transport_type TEXT DEFAULT 'streamable-http',
      oauth_metadata TEXT,
      url_patterns TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
      FOREIGN KEY (credential_id) REFERENCES board_credentials(id)
    );

    -- Cached MCP tool schemas
    CREATE TABLE IF NOT EXISTS mcp_tool_schemas (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      input_schema TEXT NOT NULL,
      output_schema TEXT,
      approval_required_fields TEXT,
      cached_at TEXT NOT NULL,
      FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
      UNIQUE(server_id, name)
    );

    -- Workflow plans
    CREATE TABLE IF NOT EXISTS workflow_plans (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planning',
      summary TEXT,
      generated_code TEXT,
      steps TEXT,
      current_step_index INTEGER,
      checkpoint_data TEXT,
      result TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    -- Workflow logs (real-time observability)
    CREATE TABLE IF NOT EXISTS workflow_logs (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      step_id TEXT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (plan_id) REFERENCES workflow_plans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_servers_board ON mcp_servers(board_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tool_schemas(server_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_plans_task ON workflow_plans(task_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_plans_board ON workflow_plans(board_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_logs_plan ON workflow_logs(plan_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_logs_step ON workflow_logs(step_id);

    -- Pending OAuth authorizations (stores PKCE code_verifier)
    CREATE TABLE IF NOT EXISTS mcp_oauth_pending (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      state TEXT NOT NULL,
      resource TEXT NOT NULL,
      scopes TEXT,
      client_id TEXT,
      client_secret TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
      FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_pending_state ON mcp_oauth_pending(state);
  `);

  runMigrations(sql);
}

function runMigrations(sql: SqlStorage): void {
  // Add url_patterns column to mcp_servers if it doesn't exist
  try {
    sql.exec('ALTER TABLE mcp_servers ADD COLUMN url_patterns TEXT');
  } catch {
    // Column already exists
  }

  // Add owner_id column to boards if it doesn't exist
  try {
    sql.exec("ALTER TABLE boards ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists
  }

  // Add schedule_config column to tasks for scheduled execution
  try {
    sql.exec('ALTER TABLE tasks ADD COLUMN schedule_config TEXT');
  } catch {
    // Column already exists
  }

  // Add parent_task_id column to tasks for parent-child relationships
  try {
    sql.exec('ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL');
  } catch {
    // Column already exists
  }

  // Add run_id column to tasks to group tasks from same scheduled run
  try {
    sql.exec('ALTER TABLE tasks ADD COLUMN run_id TEXT');
  } catch {
    // Column already exists
  }

  // Create indexes for parent-child and run relationships
  try {
    sql.exec('CREATE INDEX idx_tasks_parent ON tasks(parent_task_id)');
  } catch {
    // Index already exists
  }
  try {
    sql.exec('CREATE INDEX idx_tasks_run ON tasks(run_id)');
  } catch {
    // Index already exists
  }

  // Create scheduled_runs table to track execution history
  try {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        tasks_created INTEGER DEFAULT 0,
        summary TEXT,
        error TEXT,
        created_at TEXT NOT NULL
      )
    `);
    sql.exec('CREATE INDEX IF NOT EXISTS idx_scheduled_runs_task ON scheduled_runs(task_id)');
    sql.exec('CREATE INDEX IF NOT EXISTS idx_scheduled_runs_status ON scheduled_runs(status)');
  } catch {
    // Table or indexes already exist
  }

  // Add child_tasks_info column to scheduled_runs to preserve task info even after deletion
  try {
    sql.exec('ALTER TABLE scheduled_runs ADD COLUMN child_tasks_info TEXT');
  } catch {
    // Column already exists
  }
}
