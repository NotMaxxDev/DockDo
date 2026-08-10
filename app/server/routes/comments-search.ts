import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { getDb, comments, users, tasks, listMembers, publishSyncEvent } from '@dockdo/shared';
import { requireAuth } from '../plugins';
import { getListMembership } from '../permissions';

export function canCommentRole(role: string | undefined): boolean {
  return !!role;
}

export async function registerCommentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tasks/:id/comments', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const task = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1).then((r) => r[0]);
    if (!task) return reply.status(404).send({ error: 'Aufgabe nicht gefunden.' });
    const membership = await getListMembership(task.listId, req.user!.id);
    if (!membership) return reply.status(403).send({ error: 'Kein Zugriff.' });
    const rows = await getDb()
      .select({ comment: comments, user: users })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(eq(comments.taskId, id))
      .orderBy(comments.createdAt);
    return rows.map((r) => ({ id: r.comment.id, content: r.comment.content, createdAt: r.comment.createdAt, user: { id: r.user.id, name: r.user.name } }));
  });

  app.post('/api/tasks/:id/comments', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const task = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1).then((r) => r[0]);
    if (!task) return reply.status(404).send({ error: 'Aufgabe nicht gefunden.' });
    const membership = await getListMembership(task.listId, req.user!.id);
    if (!membership) return reply.status(403).send({ error: 'Kein Zugriff.' });
    const { content } = req.body as { content?: string };
    if (!content || !content.trim()) return reply.status(400).send({ error: 'Inhalt erforderlich.' });
    const row = { id: crypto.randomUUID(), taskId: id, userId: req.user!.id, content: content.trim(), createdAt: new Date().toISOString() };
    await getDb().insert(comments).values(row);
    await publishSyncEvent('task:comment', { listId: task.listId, taskId: id, comment: { ...row, user: { id: req.user!.id, name: req.user!.name } }, actorId: req.user!.id });
    return { ...row, user: { id: req.user!.id, name: req.user!.name } };
  });

  app.delete('/api/comments/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const c = await getDb().select().from(comments).where(eq(comments.id, id)).limit(1).then((r) => r[0]);
    if (!c) return reply.status(404).send({ error: 'Kommentar nicht gefunden.' });
    if (c.userId !== req.user!.id) {
      const task = await getDb().select().from(tasks).where(eq(tasks.id, c.taskId)).limit(1).then((r) => r[0]);
      const membership = task ? await getListMembership(task.listId, req.user!.id) : null;
      if (!task || membership?.role !== 'owner') return reply.status(403).send({ error: 'Keine Berechtigung.' });
    }
    await getDb().delete(comments).where(eq(comments.id, id));
    return { ok: true };
  });
}

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/search', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { q } = req.query as { q?: string };
    if (!q || !q.trim()) return { tasks: [], lists: [] };
    const term = `%${q.trim().toLowerCase()}%`;
    const memberLists = await getDb().select({ listId: listMembers.listId }).from(listMembers).where(eq(listMembers.userId, req.user!.id));
    const listIds = memberLists.map((m) => m.listId);
    if (!listIds.length) return { tasks: [], lists: [] };
    const rows = await getDb()
      .select()
      .from(tasks)
      .where(sql`lower(${tasks.title}) LIKE ${term} OR lower(${tasks.description}) LIKE ${term}`)
      .limit(50);
    const allowed = new Set(listIds);
    return {
      tasks: rows.filter((t) => allowed.has(t.listId)).map((t) => ({ id: t.id, title: t.title, listId: t.listId, status: t.status, dueDate: t.dueDate }))
    };
  });
}