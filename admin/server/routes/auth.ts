import type { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import {
  getDb, users, sessions, lists, tasks, listMembers, verifyPassword,
  createSession, deleteSession, cookieOptions, csrfToken, getAuthSettings,
  audit, logLoginAttempt, nowIso, hashPassword, validatePasswordStrength,
  getGeneralSettings
} from '@dockdo/shared';

export function registerAdminAuthRoutes(app: FastifyInstance): void {
  const cfg = { publicUrl: app.config.publicAdminUrl, cookieSecret: app.config.cookieSecret };
  const CSRF = 'dockdo_admin_csrf';

  function setCookies(reply: any, token: string, user: { id: string }, ttlDays: number) {
    const opts = cookieOptions(cfg, ttlDays * 24 * 60 * 60 * 1000);
    reply.setCookie('dockdo_sid', token, opts);
    reply.setCookie(CSRF, csrfToken(user.id), { ...opts, httpOnly: false });
  }

  app.post('/api/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = await getAuthSettings();
    if (auth.mode === 'oidc') return reply.status(403).send({ error: 'Lokale Anmeldung ist deaktiviert.' });
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return reply.status(400).send({ error: 'E-Mail und Passwort erforderlich.' });
    const user = await getDb().select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1).then((r) => r[0]);
    const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false;
    await logLoginAttempt(email, req.clientIp, ok);
    if (!ok || !user) return reply.status(401).send({ error: 'E-Mail oder Passwort ist falsch.' });
    if (user.status !== 'active') return reply.status(403).send({ error: 'Konto ist gesperrt.' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'Kein Admin-Zugriff.' });
    if (user.totpEnabled) {
      const { signPayload } = await import('@dockdo/shared');
      return reply.send({ needTotp: true, totpToken: signPayload(JSON.stringify({ uid: user.id, step: 'totp' }), 5 * 60 * 1000) });
    }
    const { token } = await createSession(user.id, req.clientIp, req.headers['user-agent'], auth.sessionTtlDays || 30);
    setCookies(reply, token, user, auth.sessionTtlDays || 30);
    await audit(user, 'auth:login-admin', 'user', user.id, { method: 'local' }, req.clientIp);
    return { ok: true, user: publicAdminUser(user) };
  });

  app.post('/api/admin/totp', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = await getAuthSettings();
    const { totpToken, code } = req.body as { totpToken?: string; code?: string };
    const { verifyPayload, verifyTotp } = await import('@dockdo/shared');
    const data = verifyPayload(totpToken || '') as { uid?: string; step?: string } | null;
    if (!data || data.step !== 'totp') return reply.status(400).send({ error: 'Ungültiges Ticket.' });
    const user = await getDb().select().from(users).where(eq(users.id, data.uid || '')).limit(1).then((r) => r[0]);
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, code || '')) return reply.status(401).send({ error: 'Code ungültig.' });
    const { token } = await createSession(user.id, req.clientIp, req.headers['user-agent'], auth.sessionTtlDays || 30);
    setCookies(reply, token, user, auth.sessionTtlDays || 30);
    await audit(user, 'auth:login-admin', 'user', user.id, { method: 'local+totp' }, req.clientIp);
    return { ok: true, user: publicAdminUser(user) };
  });

  app.post('/api/admin/logout', async (req, reply) => {
    if (req.sessionId) await deleteSession(req.sessionId);
    const opts = cookieOptions(cfg, 0);
    reply.clearCookie('dockdo_sid', { path: '/', secure: opts.secure, sameSite: 'lax' });
    reply.clearCookie(CSRF, { path: '/', secure: opts.secure, sameSite: 'lax' });
    return { ok: true };
  });

  app.get('/api/admin/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Nicht angemeldet' });
    if (req.user.role !== 'admin') return reply.status(403).send({ error: 'Kein Admin-Zugriff.' });
    const general = await getGeneralSettings();
    const csrf = csrfToken(req.user.id);
    reply.setCookie(CSRF, csrf, { ...cookieOptions(cfg, 86400), httpOnly: false });
    return {
      user: publicAdminUser(req.user),
      csrf,
      appName: general.appName
    };
  });
}

function publicAdminUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    totpEnabled: !!user.totpEnabled,
    createdAt: user.createdAt
  };
}

export async function adminStats(app: FastifyInstance) {
  const { settings, backups, auditLogs } = await import('@dockdo/shared');
  const usersCount = await getDb().select({ n: sql<number>`count(*)` }).from(users).then((r) => Number(r[0]?.n || 0));
  const listsCount = await getDb().select({ n: sql<number>`count(*)` }).from(lists).then((r) => Number(r[0]?.n || 0));
  const tasksCount = await getDb().select({ n: sql<number>`count(*)` }).from(tasks).then((r) => Number(r[0]?.n || 0));
  const sessionsCount = await getDb().select({ n: sql<number>`count(*)` }).from(sessions).then((r) => Number(r[0]?.n || 0));
  const activeUsers = await getDb().select({ n: sql<number>`count(*)` }).from(users).where(eq(users.status, 'active')).then((r) => Number(r[0]?.n || 0));
  const heartbeat = await getDb().select().from(settings).where(eq(settings.k, 'heartbeat')).limit(1).then((r) => r[0]?.value as Record<string, unknown> | undefined);
  const lastBackups = await getDb().select().from(backups).orderBy(desc(backups.createdAt)).limit(5);
  const recentAudit = await getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10);
  return {
    users: usersCount,
    activeUsers,
    lists: listsCount,
    tasks: tasksCount,
    sessions: sessionsCount,
    heartbeat: heartbeat || null,
    lastBackups: lastBackups.map((b) => ({ id: b.id, filename: b.filename, status: b.status, createdAt: b.createdAt, size: b.size })),
    recentAudit: recentAudit.map((a) => ({ id: a.id, action: a.action, actorEmail: a.actorEmail, createdAt: a.createdAt, targetType: a.targetType, targetId: a.targetId }))
  };
}