import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import {
  getDb, lists, listMembers, tasks, users, audit, nowIso, uuid,
  publishSyncEvent
} from '@dockdo/shared';
import { requireAdmin } from '../gateway';

function pubList(l: any, counts: Map<string, number>) {
  return {
    id: l.id, name: l.name, icon: l.icon, color: l.color, type: l.type, ownerId: l.ownerId, createdAt: l.createdAt,
    updatedAt: l.updatedAt, taskCount: counts.get(l.id) || 0
  };
}

export function registerAdminListRoutes(app: FastifyInstance): void {
  app.get('/api/admin/lists', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = (req.query as Record<string, string | undefined>) || {};
    const all = await getDb().select().from(lists);
    const countRows = await getDb().select({ listId: tasks.listId, n: tasks.id }).from(tasks);
    const counts = new Map<string, number>();
    for (const c of countRows) counts.set(c.listId, (counts.get(c.listId) || 0) + 1);
    let out = all.map((l) => pubList(l, counts));
    if (q.search) out = out.filter((l) => l.name.toLowerCase().includes(String(q.search).toLowerCase()));
    return out;
  });

  app.post('/api/admin/lists', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { name, type, color, icon, members } = req.body as {
      name?: string; type?: string; color?: string; icon?: string;
      members?: { userId: string; role?: 'viewer' | 'editor' }[];
    };
    if (!name || !name.trim()) return reply.status(400).send({ error: 'Name erforderlich.' });
    const id = uuid();
    const ts = nowIso();
    const safeType = ['todo', 'shopping', 'ideas', 'notes', 'projects'].includes(type || '') ? type : 'todo';
    await getDb().insert(lists).values({
      id, name: name.trim(), icon: icon || null, color: color || null, type: safeType,
      ownerId: req.user!.id, createdAt: ts, updatedAt: ts
    });
    await getDb().insert(listMembers).values({ listId: id, userId: req.user!.id, role: 'owner', createdAt: ts });
    const assigned: string[] = [];
    for (const m of members || []) {
      if (!m?.userId || m.userId === req.user!.id) continue;
      const safeRole = (m.role === 'editor' ? 'editor' : 'viewer') as 'viewer' | 'editor';
      await getDb()
        .insert(listMembers)
        .values({ listId: id, userId: m.userId, role: safeRole, createdAt: ts })
        .onConflictDoUpdate({ target: [listMembers.listId, listMembers.userId], set: { role: safeRole } });
      assigned.push(m.userId);
    }
    await publishSyncEvent('list:created', { listId: id, actorId: req.user!.id, members: assigned });
    await audit(req.user!, 'admin:list-created', 'list', id, { name: name.trim(), type: safeType, members: assigned }, req.clientIp);
    return { id, name: name.trim(), icon: icon || null, color: color || null, type: safeType, ownerId: req.user!.id, createdAt: ts, updatedAt: ts };
  });

  app.patch('/api/admin/lists/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const { name, type, color, icon } = req.body as { name?: string; type?: string; color?: string; icon?: string };
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (name !== undefined && name.trim()) update.name = name.trim();
    if (type !== undefined) update.type = ['todo', 'shopping', 'ideas', 'notes', 'projects'].includes(type) ? type : 'todo';
    if (color !== undefined) update.color = color;
    if (icon !== undefined) update.icon = icon;
    await getDb().update(lists).set(update).where(eq(lists.id, id));
    await publishSyncEvent('list:updated', { listId: id, actorId: req.user!.id, changes: update });
    await audit(req.user!, 'admin:list-updated', 'list', id, { changes: update }, req.clientIp);
    return { ok: true };
  });

  app.get('/api/admin/lists/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const list = await getDb().select().from(lists).where(eq(lists.id, id)).limit(1).then((r) => r[0]);
    if (!list) return reply.status(404).send({ error: 'Liste nicht gefunden.' });
    const members = await getDb()
      .select({ member: listMembers, user: users })
      .from(listMembers)
      .innerJoin(users, eq(users.id, listMembers.userId))
      .where(eq(listMembers.listId, id));
    const taskRows = await getDb().select().from(tasks).where(eq(tasks.listId, id)).orderBy(tasks.sortOrder).limit(500);
    return {
      list,
      members: members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.member.role, status: m.user.status })),
      tasks: taskRows.length
    };
  });

  app.patch('/api/admin/lists/:id/members/:userId', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id, userId } = req.params as { id: string; userId: string };
    const { role } = req.body as { role?: 'viewer' | 'editor' | 'owner' };
    const safeRole = (role ?? 'viewer') as 'viewer' | 'editor' | 'owner';
    if (!['viewer', 'editor', 'owner'].includes(role || '')) return reply.status(400).send({ error: 'Ungültige Rolle.' });
    await getDb()
      .insert(listMembers)
      .values({ listId: id, userId, role: safeRole, createdAt: nowIso() })
      .onConflictDoUpdate({ target: [listMembers.listId, listMembers.userId], set: { role: safeRole } });
    await publishSyncEvent('list:member-role', { listId: id, userId, role: safeRole, actorId: req.user!.id });
    await audit(req.user!, 'admin:list-member-role', 'list', id, { userId, role: safeRole }, req.clientIp);
    return { ok: true };
  });

  app.delete('/api/admin/lists/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    await getDb().delete(tasks).where(eq(tasks.listId, id));
    await getDb().delete(listMembers).where(eq(listMembers.listId, id));
    await getDb().delete(lists).where(eq(lists.id, id));
    await publishSyncEvent('list:deleted', { listId: id, actorId: req.user!.id });
    await audit(req.user!, 'admin:list-deleted', 'list', id, {}, req.clientIp);
    return { ok: true };
  });
}