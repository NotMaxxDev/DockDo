import { eq, inArray, sql } from 'drizzle-orm';
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

export interface SecuritySettings {
  csrfEnabled: boolean;
}

export const DEFAULT_SECURITY: SecuritySettings = {
  csrfEnabled: true
};

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

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const stored = await rawGet('security');
  if (stored && typeof stored === 'object') {
    return { ...DEFAULT_SECURITY, ...(stored as Partial<SecuritySettings>) };
  }
  return { ...DEFAULT_SECURITY };
}

export async function saveSecuritySettings(s: SecuritySettings): Promise<void> {
  await setSetting('security', s);
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
  const existing = await dbTyped().select().from(themes);
  const defaultTheme = existing.find((t) => t.isDefault);
  if (defaultTheme) {
    if (isUnchangedDefaultTheme(defaultTheme.config as ThemeConfig)) {
      await dbTyped()
        .update(themes)
        .set({ config: defaultThemeConfig(), updatedAt: nowIso() })
        .where(eq(themes.id, defaultTheme.id));
    }
    return defaultTheme.id;
  }
  const dunkel = existing.find((t) => t.name === 'Dunkel');
  if (dunkel) {
    await dbTyped()
      .update(themes)
      .set({ isDefault: true, updatedAt: nowIso() })
      .where(eq(themes.id, dunkel.id));
    return dunkel.id;
  }
  const id = uuid();
  await dbTyped().insert(themes).values({
    id,
    name: 'Dunkel',
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
    mode: 'dark',
    glass: false
  };
}

export interface ThemePreset {
  key: string;
  name: string;
  config: ThemeConfig;
}

export const PRESET_THEMES: ThemePreset[] = [
  {
    key: 'hell',
    name: 'Hell',
    config: {
      primary: '#4f46e5', accent: '#0ea5e9', background: '#f6f8fc', surface: '#ffffff',
      text: '#0f172a', muted: '#64748b', border: '#e2e8f0',
      success: '#16a34a', danger: '#dc2626', warning: '#d97706',
      font: 'Inter', radius: 12, spacing: 1, mode: 'light', glass: false
    }
  },
  {
    key: 'dunkel',
    name: 'Dunkel',
    config: {
      primary: '#6366f1', accent: '#38bdf8', background: '#060b18', surface: '#0d1526',
      text: '#e5edf7', muted: '#94a3b8', border: '#1c2a44',
      success: '#34d399', danger: '#f87171', warning: '#fbbf24',
      font: 'Inter', radius: 12, spacing: 1, mode: 'dark', glass: false
    }
  },
  {
    key: 'nord',
    name: 'Nord',
    config: {
      primary: '#5e81ac', accent: '#88c0d0', background: '#2e3440', surface: '#3b4252',
      text: '#eceff4', muted: '#d8dee9', border: '#434c5e',
      success: '#a3be8c', danger: '#bf616a', warning: '#d08770',
      font: 'Inter', radius: 12, spacing: 1, mode: 'dark', glass: false
    }
  }
];

const SHIPPED_THEME_NAMES = ['DockDo Standard', 'Dock Nacht', 'Heller Hafen', 'Meeresbriese', 'Mondlicht', 'Sonnenuntergang', 'Ozean', 'Viral Glass'];

export async function seedPresetThemes(): Promise<void> {
  const existing = await dbTyped().select().from(themes);
  const presetNames = new Set(PRESET_THEMES.map((p) => p.name));

  const toDelete = existing
    .filter((t) => SHIPPED_THEME_NAMES.includes(t.name) && !presetNames.has(t.name))
    .map((t) => t.id);
  if (toDelete.length > 0) {
    await dbTyped().delete(themes).where(inArray(themes.id, toDelete));
  }

  const kept = existing.filter((t) => !toDelete.includes(t.id));
  const byName = new Map(kept.map((t) => [t.name, t]));
  for (const preset of PRESET_THEMES) {
    if (byName.has(preset.name)) continue;
    await dbTyped().insert(themes).values({
      id: uuid(),
      name: preset.name,
      isDefault: false,
      enabled: true,
      config: preset.config,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  const after = await dbTyped().select().from(themes);
  const defaults = after.filter((t) => t.isDefault);
  if (defaults.length === 0) {
    const dunkel = after.find((t) => t.name === 'Dunkel') || after[0];
    if (dunkel) {
      await dbTyped()
        .update(themes)
        .set({ isDefault: true, updatedAt: nowIso() })
        .where(eq(themes.id, dunkel.id));
    }
  } else if (defaults.length > 1) {
    const keep = defaults.find((t) => t.name === 'Dunkel') || defaults[0];
    for (const t of defaults) {
      if (t.id !== keep.id) {
        await dbTyped()
          .update(themes)
          .set({ isDefault: false, updatedAt: nowIso() })
          .where(eq(themes.id, t.id));
      }
    }
  }
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
  mode: 'light',
  glass: false
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