import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import {
  getDb, users, sessions, invites, lists, listMembers, audit,
  nowIso, uuid, generateTemporaryPassword, hashPassword, validatePasswordStrength,
  getAuthSettings, canAppointRole, deleteUserSessions, sha256hex,
  publishSyncEvent, validateEmail, logAppEvent, settings
} from '@dockdo/shared';
import { requireAdmin } from '../gateway';

function pub(u: any) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
    locale: u.locale, timezone: u.timezone, themeId: u.themeId,
    oidcProvider: u.oidcProvider, totpEnabled: !!u.totpEnabled,
    failedAttempts: u.failedAttempts, lockedUntil: u.lockedUntil,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt
  };
}

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/api/admin/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = (req.query as Record<string, string | undefined>) || {};
    const rows = await getDb().select().from(users).orderBy(users.createdAt);
    let list = rows;
    if (q.search) {
      const s = q.search.toLowerCase();
      list = rows.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.role.includes(s));
    }
    if (q.status && q.status !== 'all') list = list.filter((u) => u.status === q.status);
    return list.map(pub);
  });

  app.post('/api/admin/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { name?: string; email?: string; password?: string; role?: 'admin' | 'moderator' | 'user'; invite?: boolean };
    if (!body.name || !body.email || !validateEmail(body.email)) return reply.status(400).send({ error: 'Name und gültige E-Mail erforderlich.' });
    if (!['admin', 'moderator', 'user'].includes(body.role || '')) return reply.status(400).send({ error: 'Ungültige Rolle.' });
    if (!canAppointRole(req.user!.role as 'admin', body.role || 'user')) return reply.status(403).send({ error: 'Rolle nicht erlaubt.' });
    const existing = await getDb().select().from(users).where(eq(users.email, body.email.toLowerCase().trim())).limit(1).then((r) => r[0]);
    if (existing) return reply.status(409).send({ error: 'Es existiert bereits ein Konto mit dieser E-Mail.' });
    const auth = await getAuthSettings();
    if (body.invite) {
      const token = require('crypto').randomBytes(24).toString('base64url');
      const inv = {
        id: uuid(), email: body.email.toLowerCase().trim(),
        tokenHash: sha256hex(token), role: body.role || 'user',
        createdBy: req.user!.id, createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), usedAt: null
      };
      await getDb().insert(invites).values(inv);
      const link = `${app.config.publicAppUrl}/register?token=${token}`;
      await audit(req.user!, 'user:invited', 'invite', inv.id, { email: inv.email, role: inv.role, link }, req.clientIp);
      return { ok: true, invite: true, inviteLink: link, expiresAt: inv.expiresAt };
    }
    const pw = body.password && body.password.length > 0 ? body.password : generateTemporaryPassword();
    const errors = validatePasswordStrength(pw, auth.local.minPasswordLength);
    if (errors.length) return reply.status(400).send({ error: errors.join(' ') });
    const id = uuid();
    await getDb().insert(users).values({
      id, email: body.email.toLowerCase().trim(), name: body.name.trim(),
      passwordHash: await hashPassword(pw), role: body.role || 'user', status: 'active',
      locale: 'de', timezone: 'UTC', themeId: null, notif: {},
      createdAt: nowIso(), updatedAt: nowIso(), lastLoginAt: null
    });
await audit(req.user!, 'user:created', 'user', id, { email: body.email, role: body.role, tempPasswordSet: !body.password }, req.clientIp);
    return { ok: true, user: pub({ id, email: body.email.toLowerCase().trim(), name: body.name.trim(), role: body.role || 'user', status: 'active' }), temporaryPassword: !body.password ? pw : undefined };
  });

  app.patch('/api/admin/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const target = await getDb().select().from(users).where(eq(users.id, id)).limit(1).then((r) => r[0]);
    if (!target) return reply.status(404).send({ error: 'Benutzer nicht gefunden.' });
    const body = req.body as { name?: string; role?: 'admin' | 'moderator' | 'user'; status?: 'active' | 'suspended'; password?: string; themeId?: string | null };
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (body.name) update.name = body.name.trim();
    if (body.role) {
      if (!canAppointRole(req.user!.role as 'admin', body.role)) return reply.status(403).send({ error: 'Rolle nicht erlaubt.' });
      if (target.id === req.user!.id && body.role !== 'admin') return reply.status(400).send({ error: 'Du kannst deine eigene Admin-Rolle nicht entziehen.' });
      update.role = body.role;
    }
    if (body.status) {
      update.status = body.status;
      if (body.status === 'suspended') {
        await deleteUserSessions(target.id);
        await publishSyncEvent('user:suspended', { userId: target.id });
      } else {
        await publishSyncEvent('user:activated', { userId: target.id });
      }
    }
    if ('themeId' in body) update.themeId = body.themeId;
    if (body.password) {
      const auth = await getAuthSettings();
      const errors = validatePasswordStrength(body.password, auth.local.minPasswordLength);
      if (errors.length) return reply.status(400).send({ error: errors.join(' ') });
      update.passwordHash = await hashPassword(body.password);
      update.failedAttempts = 0;
      update.lockedUntil = null;
      await deleteUserSessions(target.id);
    }
    await getDb().update(users).set(update).where(eq(users.id, id));
    await audit(req.user!, 'user:updated', 'user', id, { fields: Object.keys(update) }, req.clientIp);
    const fresh = await getDb().select().from(users).where(eq(users.id, id)).limit(1).then((r) => r[0]);
    return pub(fresh);
  });

  app.delete('/api/admin/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    if (id === req.user!.id) return reply.status(400).send({ error: 'Du kannst dich nicht selbst löschen.' });
    const target = await getDb().select().from(users).where(eq(users.id, id)).limit(1).then((r) => r[0]);
    if (!target) return reply.status(404).send({ error: 'Benutzer nicht gefunden.' });
    await deleteUserSessions(id);
    await getDb().delete(listMembers).where(eq(listMembers.userId, id));
    const owned = await getDb().select().from(lists).where(eq(lists.ownerId, id));
    for (const l of owned) {
      const otherOwner = await getDb().select().from(listMembers).where(and(eq(listMembers.listId, l.id), eq(listMembers.role, 'owner')));
      if (otherOwner.length === 0) await getDb().delete(lists).where(eq(lists.id, l.id));
    }
    await getDb().delete(users).where(eq(users.id, id));
    await audit(req.user!, 'user:deleted', 'user', id, { email: target.email }, req.clientIp);
    return { ok: true };
  });

  app.get('/api/admin/invites', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = await getDb().select().from(invites).orderBy(invites.createdAt);
    return rows.map((i) => ({
      id: i.id, email: i.email, role: i.role, createdAt: i.createdAt,
      expiresAt: i.expiresAt, usedAt: i.usedAt, expired: i.usedAt ? false : new Date(i.expiresAt).getTime() < Date.now()
    }));
  });

  app.delete('/api/admin/invites/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    await getDb().delete(invites).where(eq(invites.id, id));
    await audit(req.user!, 'invite:revoked', 'invite', id, {}, req.clientIp);
    return { ok: true };
  });

  app.post('/api/admin/bulk', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { action, userIds, role } = req.body as { action: 'suspend' | 'activate' | 'delete' | 'role'; userIds?: string[]; role?: string };
    const ids = (userIds || []).filter((id) => id !== req.user!.id);
    if (!ids.length) return { ok: true, processed: 0 };
    for (const id of ids) {
      const target = await getDb().select().from(users).where(eq(users.id, id)).limit(1).then((r) => r[0]);
      if (!target) continue;
      if (action === 'suspend') {
        await getDb().update(users).set({ status: 'suspended', updatedAt: nowIso() }).where(eq(users.id, id));
        await deleteUserSessions(id);
        await publishSyncEvent('user:suspended', { userId: id });
        await audit(req.user!, 'user:bulk-suspend', 'user', id, {}, req.clientIp);
      } else if (action === 'activate') {
        await getDb().update(users).set({ status: 'active', updatedAt: nowIso() }).where(eq(users.id, id));
        await publishSyncEvent('user:activated', { userId: id });
        await audit(req.user!, 'user:bulk-activate', 'user', id, {}, req.clientIp);
      } else if (action === 'delete') {
        await getDb().delete(users).where(eq(users.id, id));
        await audit(req.user!, 'user:bulk-delete', 'user', id, {}, req.clientIp);
      } else if (action === 'role' && role && ['admin', 'moderator', 'user'].includes(role)) {
        if (canAppointRole(req.user!.role as 'admin', role)) {
          await getDb().update(users).set({ role: role as 'admin' | 'moderator' | 'user', updatedAt: nowIso() }).where(eq(users.id, id));
          await audit(req.user!, 'user:bulk-role', 'user', id, { role }, req.clientIp);
        }
      }
    }
    return { ok: true, processed: ids.length };
  });

  app.get('/api/admin/sessions', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = await getDb()
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .orderBy(sessions.lastSeenAt);
    return rows.map((r) => ({
      id: r.session.id, userId: r.user.id, name: r.user.name, email: r.user.email,
      ip: r.session.ip, userAgent: r.session.userAgent, createdAt: r.session.createdAt,
      lastSeenAt: r.session.lastSeenAt, expiresAt: r.session.expiresAt,
      current: r.session.id === req.sessionId
    }));
  });

  app.delete('/api/admin/sessions/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const s = await getDb().select().from(sessions).where(eq(sessions.id, id)).limit(1).then((r) => r[0]);
    if (!s) return reply.status(404).send({ error: 'Session nicht gefunden.' });
    await getDb().delete(sessions).where(eq(sessions.id, id));
    await audit(req.user!, 'session:revoked', 'session', id, { userId: s.userId }, req.clientIp);
return { ok: true };
  });
}
