import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'moderator', 'user'] }).notNull().default('user'),
  status: text('status', { enum: ['active', 'suspended', 'invited'] }).notNull().default('invited'),
  locale: text('locale').notNull().default('de'),
  timezone: text('timezone').notNull().default('UTC'),
  themeId: text('theme_id'),
  notif: text('notif', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  oidcSubject: text('oidc_subject'),
  oidcProvider: text('oidc_provider'),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastLoginAt: text('last_login_at')
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = 'admin' | 'moderator' | 'user';
export type UserStatus = 'active' | 'suspended' | 'invited';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  expiresAt: text('expires_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  createdAt: text('created_at').notNull()
});

export type Session = typeof sessions.$inferSelect;

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role').notNull().default('user'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at')
});

export type Invite = typeof invites.$inferSelect;

export const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color'),
  ownerId: text('owner_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export type List = typeof lists.$inferSelect;

export const listMembers = sqliteTable(
  'list_members',
  {
    listId: text('list_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => ({ pk: primaryKey({ columns: [t.listId, t.userId] }) })
);

export type ListMember = typeof listMembers.$inferSelect;
export type ListRole = 'owner' | 'editor' | 'viewer';

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#64748b'),
  createdAt: text('created_at').notNull()
});

export const taskLabels = sqliteTable(
  'task_labels',
  {
    taskId: text('task_id').notNull(),
    labelId: text('label_id').notNull()
  },
  (t) => ({ pk: primaryKey({ columns: [t.taskId, t.labelId] }) })
);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  dueDate: text('due_date'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  status: text('status', { enum: ['todo', 'in_progress', 'done', 'cancelled'] }).notNull().default('todo'),
  sortOrder: real('sort_order').notNull().default(0),
  assigneeId: text('assignee_id'),
  recurrence: text('recurrence', { mode: 'json' }).$type<RecurrenceRule | null>().default(null),
  version: integer('version').notNull().default(1),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
  dueNotified: integer('due_notified', { mode: 'boolean' }).notNull().default(false)
});

export type Task = typeof tasks.$inferSelect;
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high';

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: string;
  count?: number;
  generated?: number;
}

export const subtasks = sqliteTable('subtasks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull()
});

export type Subtask = typeof subtasks.$inferSelect;

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  userId: text('user_id').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull()
});

export type Comment = typeof comments.$inferSelect;

export const themes = sqliteTable('themes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config', { mode: 'json' }).$type<ThemeConfig>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export type Theme = typeof themes.$inferSelect;

export interface ThemeConfig {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  font: string;
  radius: number;
  spacing: number;
  mode: 'light' | 'dark';
}

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorId: text('actor_id'),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  details: text('details', { mode: 'json' }).$type<Record<string, unknown> | null>().default(null),
  ip: text('ip'),
  createdAt: text('created_at').notNull()
});

export type AuditLog = typeof auditLogs.$inferSelect;

export const settings = sqliteTable('settings', {
  k: text('k').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: text('updated_at').notNull()
});

export type Setting = typeof settings.$inferSelect;

export const backupTargets = sqliteTable('backup_targets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['local', 's3', 'smb'] }).notNull(),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export type BackupTarget = typeof backupTargets.$inferSelect;

export const backupJobs = sqliteTable('backup_jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  targetId: text('target_id').notNull(),
  schedule: text('schedule').notNull(),
  retention: text('retention', { mode: 'json' }).$type<{ daily: number; weekly: number; monthly: number }>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: text('last_run_at'),
  lastStatus: text('last_status'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull()
});

export type BackupJob = typeof backupJobs.$inferSelect;

export const backups = sqliteTable('backups', {
  id: text('id').primaryKey(),
  jobId: text('job_id'),
  targetId: text('target_id').notNull(),
  filename: text('filename').notNull(),
  size: integer('size').notNull().default(0),
  status: text('status').notNull().default('ok'),
  meta: text('meta', { mode: 'json' }).$type<Record<string, unknown> | null>().default(null),
  createdAt: text('created_at').notNull()
});

export type Backup = typeof backups.$inferSelect;

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  keys: text('keys', { mode: 'json' }).$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: text('created_at').notNull()
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export const syncEvents = sqliteTable('sync_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown> | null>().default(null),
  createdAt: text('created_at').notNull()
});

export type SyncEvent = typeof syncEvents.$inferSelect;

export const appEvents = sqliteTable('app_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level').notNull().default('info'),
  source: text('source').notNull(),
  message: text('message').notNull(),
  meta: text('meta', { mode: 'json' }).$type<Record<string, unknown> | null>().default(null),
  createdAt: text('created_at').notNull()
});

export type AppEvent = typeof appEvents.$inferSelect;

export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  ip: text('ip'),
  success: integer('success', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull()
});

export type LoginAttempt = typeof loginAttempts.$inferSelect;

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: text('scopes', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at')
});

export type ApiToken = typeof apiTokens.$inferSelect;