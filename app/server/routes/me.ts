import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  getDb, users, sessions, themes, hashPassword, verifyPassword,
  deleteSession, audit, nowIso, uuid, signPayload, verifyPayload,
  generateTotpSecret, verifyTotp, otpauthUrl, validatePasswordStrength,
  getAuthSettings
} from '@dockdo/shared';
import { requireAuth } from '../plugins';
import { publicUser } from './auth';

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const themeRows = await getDb().select().from(themes).where(eq(themes.enabled, true));
    return {
      user: publicUser(req.user!),
      themes: themeRows.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault, config: t.config })),
      csrf: undefined
    };
  });

  app.put('/api/me/settings', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { locale, timezone, notif } = req.body as { locale?: string; timezone?: string; notif?: Record<string, unknown> };
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (locale && ['de', 'en'].includes(locale)) update.locale = locale;
    if (timezone) update.timezone = timezone;
    if (notif && typeof notif === 'object') update.notif = notif;
    await getDb().update(users).set(update).where(eq(users.id, req.user!.id));
    await audit(req.user!, 'user:settings-updated', 'user', req.user!.id, { fields: Object.keys(update) }, req.clientIp);
    const fresh = await getDb().select().from(users).where(eq(users.id, req.user!.id)).limit(1).then((r) => r[0]);
    return { user: publicUser(fresh) };
  });

  app.put('/api/me/theme', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { themeId } = req.body as { themeId?: string };
    const theme = await getDb().select().from(themes).where(eq(themes.id, themeId || '')).limit(1).then((r) => r[0]);
    if (!theme || !theme.enabled) return reply.status(400).send({ error: 'Theme nicht verfügbar.' });
    await getDb().update(users).set({ themeId: theme.id, updatedAt: nowIso() }).where(eq(users.id, req.user!.id));
    const fresh = await getDb().select().from(users).where(eq(users.id, req.user!.id)).limit(1).then((r) => r[0]);
    return { user: publicUser(fresh) };
  });

  app.post('/api/me/password', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    const user = await getDb().select().from(users).where(eq(users.id, req.user!.id)).limit(1).then((r) => r[0]);
    if (!user?.passwordHash) return reply.status(400).send({ error: 'Passwort wird über OIDC verwaltet.' });
    if (!currentPassword || !(await verifyPassword(user.passwordHash, currentPassword))) {
      return reply.status(401).send({ error: 'Aktuelles Passwort ist falsch.' });
    }
    const auth = await getAuthSettings();
    const errors = validatePasswordStrength(newPassword || '', auth.local.minPasswordLength);
    if (errors.length) return reply.status(400).send({ error: errors.join(' ') });
    await getDb().update(users).set({ passwordHash: await hashPassword(newPassword!), updatedAt: nowIso() }).where(eq(users.id, user.id));
    await deleteSession(req.sessionId!);
    await audit(req.user!, 'user:password-changed', 'user', user.id, {}, req.clientIp);
    return { ok: true, sessionEnded: true };
  });

  app.delete('/api/me/sessions/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const s = await getDb().select().from(sessions).where(eq(sessions.id, id)).limit(1).then((r) => r[0]);
    if (!s || s.userId !== req.user!.id) return reply.status(404).send({ error: 'Session nicht gefunden.' });
    await deleteSession(id);
    await audit(req.user!, 'user:session-killed', 'session', id, {}, req.clientIp);
    return { ok: true };
  });

  app.post('/api/me/totp/setup', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const secret = generateTotpSecret();
    await getDb().update(users).set({ totpSecret: secret, updatedAt: nowIso() }).where(eq(users.id, req.user!.id));
    return { secret, otpauthUrl: otpauthUrl(secret, req.user!.email) };
  });

  app.post('/api/me/totp/enable', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { code } = req.body as { code?: string };
    const user = await getDb().select().from(users).where(eq(users.id, req.user!.id)).limit(1).then((r) => r[0]);
    if (!user?.totpSecret) return reply.status(400).send({ error: 'TOTP-Setup nicht gestartet.' });
    if (!verifyTotp(user.totpSecret, code || '')) return reply.status(401).send({ error: 'Code ungültig.' });
    await getDb().update(users).set({ totpEnabled: true, updatedAt: nowIso() }).where(eq(users.id, user.id));
    await audit(req.user!, 'user:totp-enabled', 'user', user.id, {}, req.clientIp);
    return { ok: true };
  });

  app.post('/api/me/totp/disable', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { code } = req.body as { code?: string };
    const user = await getDb().select().from(users).where(eq(users.id, req.user!.id)).limit(1).then((r) => r[0]);
    if (!user?.totpSecret) return reply.status(400).send({ error: 'TOTP nicht aktiv.' });
    if (!verifyTotp(user.totpSecret, code || '')) return reply.status(401).send({ error: 'Code ungültig.' });
    await getDb().update(users).set({ totpEnabled: false, totpSecret: null, updatedAt: nowIso() }).where(eq(users.id, user.id));
    await audit(req.user!, 'user:totp-disabled', 'user', user.id, {}, req.clientIp);
    return { ok: true };
  });
}