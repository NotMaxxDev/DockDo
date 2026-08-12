import { eq, sql } from 'drizzle-orm';
import { settings, users, loginAttempts, auditLogs, appEvents, syncEvents, themes, type User, type Role, type ThemeConfig } from './db-schema';
import { getDb, dbTyped } from './db-client';
import { nowIso, uuid } from './config';

export interface AuthSettings {
  mode: 'local' | 'oidc' | 'both';
  local: {
    minPasswordLength: number;
    lockoutThreshold: number;
    lockoutMinutes: number;
  };
  sessionTtlDays: number;
  oidcProviders: OidcProviderConfig[];
  emergencyAdminEmail: string;
}

export interface OidcProviderConfig {
  id: string;
  name: string;
  provider: 'keycloak' | 'authentik' | 'custom';
  enabled: boolean;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  roleClaimPath: string;
  roleMapping: { admin: string[]; moderator: string[]; user: string[] };
  autoProvision: boolean;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface GeneralSettings {
  appName: string;
  logoText: string;
  registrationDescription: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

export const DEFAULT_AUTH: AuthSettings = {
  mode: 'local',
  local: { minPasswordLength: 8, lockoutThreshold: 5, lockoutMinutes: 15 },
  sessionTtlDays: 30,
  oidcProviders: [],
  emergencyAdminEmail: ''
};

export const DEFAULT_SMTP: SmtpSettings = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  from: 'DockDo <noreply@localhost>'
};

export const DEFAULT_GENERAL: GeneralSettings = {
  appName: 'DockDo',
  logoText: 'DockDo',
  registrationDescription: '',
  vapidPublicKey: '',
  vapidPrivateKey: '',
  vapidSubject: 'mailto:admin@localhost'
};

async function rawGet(key: string): Promise<unknown | undefined> {
  const row = await getDb().select().from(settings).where(eq(settings.k, key)).limit(1).then((r) => r[0]);
  return row?.value;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const v = await rawGet(key);
  return (v === undefined ? fallback : (v as T));
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await getDb()
    .insert(settings)
    .values({ k: key, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: settings.k, set: { value, updatedAt: nowIso() } });
}

export async function getAuthSettings(): Promise<AuthSettings> {
  const stored = await rawGet('auth');
  if (stored && typeof stored === 'object') {
    const s = { ...DEFAULT_AUTH, ...(stored as Partial<AuthSettings>) };
    if (!Array.isArray(s.oidcProviders)) s.oidcProviders = [];
    return s;
  }
  return { ...DEFAULT_AUTH };
}

export async function saveAuthSettings(auth: AuthSettings): Promise<void> {
  await setSetting('auth', auth);
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const stored = await rawGet('smtp');
  return { ...DEFAULT_SMTP, ...(stored as Partial<SmtpSettings> | undefined) };
}

export async function saveSmtpSettings(smtp: SmtpSettings): Promise<void> {
  await setSetting('smtp', smtp);
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const stored = await rawGet('general');
  return { ...DEFAULT_GENERAL, ...(stored as Partial<GeneralSettings> | undefined) };
}

export async function saveGeneralSettings(g: GeneralSettings): Promise<void> {
  await setSetting('general', g);
}

export async function countUsers(): Promise<number> {
  const row = await dbTyped().select({ n: sql<number>`count(*)` }).from(users);
  return row[0]?.n || 0;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  return dbTyped()
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1)
    .then((r) => r[0]);
}

export async function audit(
  actor: { id: string; email: string } | null,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>,
  ip?: string
): Promise<void> {
  try {
    await dbTyped()
      .insert(auditLogs)
      .values({
        actorId: actor?.id || null,
        actorEmail: actor?.email || null,
        action,
        targetType: targetType || null,
        targetId: targetId || null,
        details: details || null,
        ip: ip || null,
        createdAt: nowIso()
      });
  } catch (err) {
    console.error('audit failed', err);
  }
}

export async function logAppEvent(level: 'info' | 'warn' | 'error', source: string, message: string, meta?: Record<string, unknown>): Promise<void> {
  try {
    await dbTyped()
      .insert(appEvents)
      .values({ level, source, message: String(message).slice(0, 4000), meta: meta || null, createdAt: nowIso() });
  } catch {
    /* ignore */
  }
  if (level === 'error') console.error(`[${source}]`, message, meta || '');
}

export async function logLoginAttempt(email: string, ip: string | undefined, success: boolean): Promise<void> {
  try {
    await dbTyped().insert(loginAttempts).values({ email: email.toLowerCase().trim(), ip: ip || null, success, createdAt: nowIso() });
  } catch {
    /* ignore */
  }
}

export async function publishSyncEvent(type: string, payload?: Record<string, unknown>): Promise<void> {
  try {
    await dbTyped().insert(syncEvents).values({ type, payload: payload || null, createdAt: nowIso() });
  } catch (err) {
    console.error('publishSyncEvent failed', err);
  }
}

export async function createDefaultThemeIfMissing(): Promise<string> {
  const existing = await dbTyped().select().from(themes).limit(1);
  if (existing.length > 0) {
    const t = existing[0];
    if (t.isDefault && isUnchangedDefaultTheme(t.config as ThemeConfig)) {
      await dbTyped()
        .update(themes)
        .set({ config: defaultThemeConfig(), updatedAt: nowIso() })
        .where(eq(themes.id, t.id));
      return t.id;
    }
    return t.id;
  }
  const id = uuid();
  await dbTyped().insert(themes).values({
    id,
    name: 'DockDo Standard',
    isDefault: true,
    enabled: true,
    config: defaultThemeConfig(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return id;
}

export function defaultThemeConfig(): ThemeConfig {
  return {
    primary: '#6366f1',
    accent: '#38bdf8',
    background: '#060b18',
    surface: '#0d1526',
    text: '#e5edf7',
    muted: '#94a3b8',
    border: '#1c2a44',
    success: '#34d399',
    danger: '#f87171',
    warning: '#fbbf24',
    font: 'Inter',
    radius: 12,
    spacing: 1,
    mode: 'dark'
  };
}

const LEGACY_LIGHT_DEFAULT: ThemeConfig = {
  primary: '#4f46e5',
  accent: '#0ea5e9',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  success: '#16a34a',
  danger: '#dc2626',
  warning: '#d97706',
  font: 'Inter',
  radius: 12,
  spacing: 1,
  mode: 'light'
};

function isUnchangedDefaultTheme(config: ThemeConfig): boolean {
  return JSON.stringify(config) === JSON.stringify(LEGACY_LIGHT_DEFAULT);
}

export function isAdminRole(role: string): boolean {
  return role === 'admin';
}

export function canAppointRole(actorRole: Role, targetRole: string): boolean {
  if (actorRole === 'admin') return ['admin', 'moderator', 'user'].includes(targetRole);
  if (actorRole === 'moderator') return ['moderator', 'user'].includes(targetRole);
  return false;
}