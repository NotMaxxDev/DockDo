import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  getSetting, setSetting, getAuthSettings,
  getGeneralSettings, createDefaultThemeIfMissing, defaultThemeConfig,
  themes, countUsers, getDb, users, hashPassword, validatePasswordStrength,
  uuid, nowIso, audit, testMariaDbConnection, writeDbModeFile, loadConfig
} from '@dockdo/shared';

export async function registerMetaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/meta', async () => {
    const auth = await getAuthSettings();
    const general = await getGeneralSettings();
    const themeRows = await getDb().select().from(themes).where(eq(themes.enabled, true));
    const defTheme = themeRows.find((t) => t.isDefault) || themeRows[0];
    return {
      appName: general.appName,
      authMode: auth.mode,
      oidcProviders: auth.oidcProviders.filter((p) => p.enabled).map((p) => ({ id: p.id, name: p.name, provider: p.provider })),
      themes: themeRows.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault, config: t.config })),
      defaultTheme: defTheme ? { id: defTheme.id, config: defTheme.config } : { config: defaultThemeConfig() },
      version: '1.0.0'
    };
  });
}

export async function registerSetupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/setup/state', async () => {
    const total = await countUsers();
    const cfg = loadConfig();
    return { done: total > 0, dbMode: cfg.dbMode };
  });

  app.post('/api/setup', async (req, reply) => {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    if (!name || !email || !password) {
      return reply.status(400).send({ error: 'Bitte alle Felder ausfüllen.' });
    }
    const total = await countUsers();
    if (total > 0) return reply.status(403).send({ error: 'Setup bereits abgeschlossen.' });

    const auth = await getAuthSettings();
    const errors = validatePasswordStrength(password, auth.local.minPasswordLength);
    if (errors.length) return reply.status(400).send({ error: errors.join(' ') });

    const themeId = await createDefaultThemeIfMissing();
    await getDb().insert(users).values({
      id: uuid(),
      email: email.toLowerCase().trim(),
      name,
      passwordHash: await hashPassword(password),
      role: 'admin',
      status: 'active',
      locale: 'de',
      timezone: 'UTC',
      themeId,
      notif: { push: true, email: false, dueOffsetMin: 60, assignPush: true, commentPush: true },
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    await audit(null, 'setup:completed', 'system', undefined, { email });
    return { ok: true };
  });

  app.post('/api/setup/db', async (req, reply) => {
    const { mode } = req.body as { mode?: 'sqlite' | 'mariadb' };
    if (mode !== 'sqlite' && mode !== 'mariadb') return reply.status(400).send({ error: 'Ungültiger Modus.' });
    if (mode === 'mariadb') {
      const cfg = loadConfig();
      const test = await testMariaDbConnection(cfg);
      if (!test.ok) {
        return reply.status(400).send({
          error: `Verbindung zu MariaDB fehlgeschlagen: ${test.error}. Bitte prüfe die Datenbank-Zugangsdaten in .env und starte Docker Compose mit dem Profil: docker compose --profile mariadb up -d`
        });
      }
    }
    const cfg = loadConfig();
    writeDbModeFile(cfg.dataDir, mode);
    return { ok: true, restartRequired: true, mode };
  });
}