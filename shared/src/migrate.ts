import { DbHandle, runRaw } from './db-client';

const SQLITE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT, role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'invited', locale TEXT NOT NULL DEFAULT 'de', timezone TEXT NOT NULL DEFAULT 'UTC', theme_id TEXT, notif TEXT NOT NULL DEFAULT '{}', oidc_subject TEXT, oidc_provider TEXT, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, ip TEXT, user_agent TEXT, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'user', created_by TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, color TEXT, type TEXT NOT NULL DEFAULT 'todo', owner_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS list_members (list_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (list_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS labels (id TEXT PRIMARY KEY, list_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#64748b', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS task_labels (task_id TEXT NOT NULL, label_id TEXT NOT NULL, PRIMARY KEY (task_id, label_id))`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, list_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', due_date TEXT, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'todo', sort_order REAL NOT NULL DEFAULT 0, assignee_id TEXT, recurrence TEXT, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, due_notified INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS subtasks (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS themes (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, config TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, actor_email TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, details TEXT, ip TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backup_targets (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, config TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backup_jobs (id TEXT PRIMARY KEY, name TEXT NOT NULL, target_id TEXT NOT NULL, schedule TEXT NOT NULL, retention TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_status TEXT, last_error TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, job_id TEXT, target_id TEXT NOT NULL, filename TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok', meta TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, keys TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS app_events (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT NOT NULL DEFAULT 'info', source TEXT NOT NULL, message TEXT NOT NULL, meta TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, ip TEXT, success INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, last_used_at TEXT, expires_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_events_created ON sync_events(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_labels_list ON labels(list_id)`
];

const MYSQL_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, password_hash VARCHAR(255), role VARCHAR(16) NOT NULL DEFAULT 'user', status VARCHAR(16) NOT NULL DEFAULT 'invited', locale VARCHAR(8) NOT NULL DEFAULT 'de', timezone VARCHAR(64) NOT NULL DEFAULT 'UTC', theme_id VARCHAR(64), notif JSON NOT NULL, oidc_subject VARCHAR(255), oidc_provider VARCHAR(64), totp_secret VARCHAR(255), totp_enabled TINYINT(1) NOT NULL DEFAULT 0, failed_attempts INT NOT NULL DEFAULT 0, locked_until DATETIME(3) NULL, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, last_login_at DATETIME(3) NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, ip VARCHAR(64), user_agent VARCHAR(512), expires_at DATETIME(3) NOT NULL, last_seen_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL, INDEX idx_sessions_user (user_id))`,
  `CREATE TABLE IF NOT EXISTS invites (id VARCHAR(64) PRIMARY KEY, email VARCHAR(255) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, role VARCHAR(16) NOT NULL DEFAULT 'user', created_by VARCHAR(64), created_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL, used_at DATETIME(3) NULL)`,
  `CREATE TABLE IF NOT EXISTS lists (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, icon VARCHAR(64), color VARCHAR(16), type VARCHAR(16) NOT NULL DEFAULT 'todo', owner_id VARCHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS list_members (list_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL, role VARCHAR(16) NOT NULL, created_at DATETIME(3) NOT NULL, PRIMARY KEY (list_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS labels (id VARCHAR(64) PRIMARY KEY, list_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, color VARCHAR(16) NOT NULL DEFAULT '#64748b', created_at DATETIME(3) NOT NULL, INDEX idx_labels_list (list_id))`,
  `CREATE TABLE IF NOT EXISTS task_labels (task_id VARCHAR(64) NOT NULL, label_id VARCHAR(64) NOT NULL, PRIMARY KEY (task_id, label_id))`,
  `CREATE TABLE IF NOT EXISTS tasks (id VARCHAR(64) PRIMARY KEY, list_id VARCHAR(64) NOT NULL, title VARCHAR(512) NOT NULL, description TEXT NOT NULL, due_date DATETIME(3) NULL, priority VARCHAR(16) NOT NULL DEFAULT 'medium', status VARCHAR(16) NOT NULL DEFAULT 'todo', sort_order DOUBLE NOT NULL DEFAULT 0, assignee_id VARCHAR(64), recurrence JSON NULL, version INT NOT NULL DEFAULT 1, created_by VARCHAR(64), created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, completed_at DATETIME(3) NULL, due_notified TINYINT(1) NOT NULL DEFAULT 0, INDEX idx_tasks_list (list_id), INDEX idx_tasks_due (due_date), INDEX idx_tasks_assignee (assignee_id))`,
  `CREATE TABLE IF NOT EXISTS subtasks (id VARCHAR(64) PRIMARY KEY, task_id VARCHAR(64) NOT NULL, title VARCHAR(512) NOT NULL, done TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS comments (id VARCHAR(64) PRIMARY KEY, task_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL, content TEXT NOT NULL, created_at DATETIME(3) NOT NULL, INDEX idx_comments_task (task_id))`,
  `CREATE TABLE IF NOT EXISTS themes (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, is_default TINYINT(1) NOT NULL DEFAULT 0, enabled TINYINT(1) NOT NULL DEFAULT 1, config JSON NOT NULL, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, actor_id VARCHAR(64), actor_email VARCHAR(255), action VARCHAR(128) NOT NULL, target_type VARCHAR(64), target_id VARCHAR(64), details JSON NULL, ip VARCHAR(64), created_at DATETIME(3) NOT NULL, INDEX idx_audit_created (created_at))`,
  `CREATE TABLE IF NOT EXISTS settings (k VARCHAR(128) PRIMARY KEY, value JSON NOT NULL, updated_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backup_targets (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(16) NOT NULL, config JSON NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backup_jobs (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, target_id VARCHAR(64) NOT NULL, schedule VARCHAR(128) NOT NULL, retention JSON NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 1, last_run_at DATETIME(3) NULL, last_status VARCHAR(32), last_error TEXT, created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backups (id VARCHAR(64) PRIMARY KEY, job_id VARCHAR(64), target_id VARCHAR(64) NOT NULL, filename VARCHAR(512) NOT NULL, size BIGINT NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'ok', meta JSON NULL, created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, endpoint VARCHAR(512) NOT NULL UNIQUE, keys JSON NOT NULL, created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_events (id BIGINT AUTO_INCREMENT PRIMARY KEY, type VARCHAR(128) NOT NULL, payload JSON NULL, created_at DATETIME(3) NOT NULL, INDEX idx_sync_events_created (created_at))`,
  `CREATE TABLE IF NOT EXISTS app_events (id BIGINT AUTO_INCREMENT PRIMARY KEY, level VARCHAR(16) NOT NULL DEFAULT 'info', source VARCHAR(128) NOT NULL, message TEXT NOT NULL, meta JSON NULL, created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (id BIGINT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL, ip VARCHAR(64), success TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS api_tokens (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, scopes JSON NOT NULL, created_at DATETIME(3) NOT NULL, last_used_at DATETIME(3) NULL, expires_at DATETIME(3) NULL)`
];

export async function migrateUp(handle: DbHandle): Promise<void> {
  const ddl = handle.mode === 'sqlite' ? SQLITE_DDL : MYSQL_DDL;
  for (const statement of ddl) {
    await runRaw(handle, statement);
  }
  try {
    if (handle.mode === 'sqlite') {
      await runRaw(handle, `ALTER TABLE lists ADD COLUMN type TEXT NOT NULL DEFAULT 'todo'`);
    } else {
      await runRaw(handle, `ALTER TABLE lists ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'todo'`);
    }
  } catch {
    /* Spalte existiert bereits */
  }
}