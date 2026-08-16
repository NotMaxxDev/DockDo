import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb, lists, listMembers, users, labels, audit, nowIso, uuid, publishSyncEvent } from '@dockdo/shared';
import { requireAuth } from '../plugins';
import { getListMembership, canEditByRole, canAdminByRole } from '../permissions';

export async function registerListRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/lists', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const rows = await getDb()
      .select({ list: lists, memberRole: listMembers.role })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(eq(listMembers.userId, req.user!.id));
    return rows.map((r) => ({ ...r.list, memberRole: r.memberRole }));
  });

  app.get('/api/lists/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const membership = await getListMembership(id, req.user!.id);
    if (!membership) return reply.status(403).send({ error: 'Kein Zugriff auf diese Liste.' });
    const list = await getDb().select().from(lists).where(eq(lists.id, id)).limit(1).then((r) => r[0]);
    const members = await getDb()
      .select({ member: listMembers, user: users })
      .from(listMembers)
      .innerJoin(users, eq(users.id, listMembers.userId))
      .where(eq(listMembers.listId, id));
    const labelRows = await getDb().select().from(labels).where(eq(labels.listId, id));
    return {
      list,
      memberRole: membership.role,
      members: members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.member.role, status: m.user.status })),
      labels: labelRows.map((l) => ({ id: l.id, name: l.name, color: l.color }))
    };
  });

  app.patch('/api/lists/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const membership = await getListMembership(id, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const { name, icon, color } = req.body as { name?: string; icon?: string; color?: string };
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (name) update.name = name.trim();
    if (icon !== undefined) update.icon = icon;
    if (color !== undefined) update.color = color;
    await getDb().update(lists).set(update).where(eq(lists.id, id));
    await publishSyncEvent('list:updated', { listId: id, actorId: req.user!.id, changes: update });
    return { ok: true };
  });

  app.delete('/api/lists/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const membership = await getListMembership(id, req.user!.id);
    if (!canAdminByRole(membership?.role)) return reply.status(403).send({ error: 'Nur der Owner kann die Liste löschen.' });
    await getDb().delete(lists).where(eq(lists.id, id));
    await publishSyncEvent('list:deleted', { listId: id, actorId: req.user!.id });
    await audit(req.user!, 'list:deleted', 'list', id, {}, req.clientIp);
    return { ok: true };
  });

  app.post('/api/lists/:id/labels', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const membership = await getListMembership(id, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const { name, color } = req.body as { name?: string; color?: string };
    if (!name || !name.trim()) return reply.status(400).send({ error: 'Name erforderlich.' });
    const row = { id: uuid(), listId: id, name: name.trim(), color: color || '#64748b', createdAt: nowIso() };
    await getDb().insert(labels).values(row);
    return row;
  });

  app.patch('/api/lists/:listId/labels/:labelId', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { listId, labelId } = req.params as { listId: string; labelId: string };
    const membership = await getListMembership(listId, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const { name, color } = req.body as { name?: string; color?: string };
    const update: Record<string, unknown> = {};
    if (name) update.name = name.trim();
    if (color) update.color = color;
    await getDb().update(labels).set(update).where(eq(labels.id, labelId));
    return { ok: true };
  });

  app.delete('/api/lists/:listId/labels/:labelId', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { listId, labelId } = req.params as { listId: string; labelId: string };
    const membership = await getListMembership(listId, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    await getDb().delete(labels).where(eq(labels.id, labelId));
    return { ok: true };
  });
}