import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import {
  getDb, tasks, subtasks, taskLabels, labels, users, listMembers, lists,
  audit, nowIso, uuid, publishSyncEvent,
  type TaskStatus, type Priority, type RecurrenceRule
} from '@dockdo/shared';
import { requireAuth } from '../plugins';
import { getListMembership, canEditByRole } from '../permissions';

export function nextRecurringDue(rule: RecurrenceRule, from: Date): Date {
  const next = new Date(from);
  const interval = Math.max(1, rule.interval || 1);
  if (rule.freq === 'daily') next.setDate(next.getDate() + interval);
  else if (rule.freq === 'weekly') {
    next.setDate(next.getDate() + 7 * interval);
    const want = rule.daysOfWeek && rule.daysOfWeek.length ? rule.daysOfWeek[0] : undefined;
    if (want !== undefined) {
      const delta = (want - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + delta);
    }
  } else if (rule.freq === 'monthly') {
    const targetDay = rule.dayOfMonth || next.getDate();
    next.setMonth(next.getMonth() + interval);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(targetDay, lastDay));
  } else {
    next.setDate(next.getDate() + interval);
  }
  return next;
}

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  const membersOf = async (listId: string) =>
    (await getDb().select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, listId))).map((r) => r.userId);

  app.get('/api/lists/:id/tasks', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const membership = await getListMembership(id, req.user!.id);
    if (!membership) return reply.status(403).send({ error: 'Kein Zugriff.' });
    const q = (req.query as Record<string, string | undefined>) || {};
    const conditions: ReturnType<typeof eq>[] = [eq(tasks.listId, id)];
    if (q.status && q.status !== 'all') conditions.push(eq(tasks.status, q.status as TaskStatus));
    if (q.assignee) {
      if (q.assignee === 'me') conditions.push(eq(tasks.assigneeId, req.user!.id));
      else conditions.push(eq(tasks.assigneeId, q.assignee));
    }
    const rows = conditions.length === 1
      ? await getDb().select().from(tasks).where(conditions[0]).orderBy(tasks.sortOrder)
      : await getDb().select().from(tasks).where(and(...conditions)).orderBy(tasks.sortOrder);
    const ids = rows.map((t) => t.id);
    const labelsForTasks = ids.length
      ? await getDb()
          .select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId, name: labels.name, color: labels.color })
          .from(taskLabels)
          .innerJoin(labels, eq(labels.id, taskLabels.labelId))
          .where(sql`${taskLabels.taskId} IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`)
      : [];
    const subs = ids.length
      ? await getDb().select().from(subtasks).where(sql`${subtasks.taskId} IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`)
      : [];
    return {
      tasks: rows.map((t) => ({
        ...t,
        labels: labelsForTasks.filter((l) => l.taskId === t.id).map((l) => ({ id: l.labelId, name: l.name, color: l.color })),
        subtasks: subs.filter((s) => s.taskId === t.id)
      }))
    };
  });

  app.get('/api/board', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const userId = req.user!.id;
    const memberRows = await getDb().select().from(listMembers).where(eq(listMembers.userId, userId));
    if (!memberRows.length) return { lists: [], tasks: [] };
    const listIds = memberRows.map((m) => m.listId);
    const inListIds = sql`${tasks.listId} IN (${sql.join(listIds.map((x) => sql`${x}`), sql`, `)})`;
    const listRows = await getDb()
      .select({ list: lists, memberRole: listMembers.role })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(eq(listMembers.userId, userId));
    const rows = await getDb().select().from(tasks).where(inListIds).orderBy(tasks.sortOrder);
    const ids = rows.map((t) => t.id);
    const labelsForTasks = ids.length
      ? await getDb()
          .select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId, name: labels.name, color: labels.color })
          .from(taskLabels)
          .innerJoin(labels, eq(labels.id, taskLabels.labelId))
          .where(sql`${taskLabels.taskId} IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`)
      : [];
    const subs = ids.length
      ? await getDb().select().from(subtasks).where(sql`${subtasks.taskId} IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`)
      : [];
    const assigneeIds = [...new Set(rows.map((t) => t.assigneeId).filter((x): x is string => !!x))];
    const assignees = assigneeIds.length
      ? await getDb().select({ id: users.id, name: users.name }).from(users)
          .where(sql`${users.id} IN (${sql.join(assigneeIds.map((x) => sql`${x}`), sql`, `)})`)
      : [];
    return {
      lists: listRows.map((r) => ({
        id: r.list.id,
        name: r.list.name,
        color: r.list.color,
        memberRole: r.memberRole as 'owner' | 'editor' | 'viewer'
      })),
      assignees,
      tasks: rows.map((t) => ({
        ...t,
        labels: labelsForTasks.filter((l) => l.taskId === t.id).map((l) => ({ id: l.labelId, name: l.name, color: l.color })),
        subtasks: subs.filter((s) => s.taskId === t.id)
      }))
    };
  });

  app.post('/api/lists/:id/tasks', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const membership = await getListMembership(id, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const body = req.body as {
      title?: string; description?: string; dueDate?: string | null; priority?: Priority;
      assigneeId?: string | null; labelIds?: string[]; recurrence?: RecurrenceRule | null;
    };
    if (!body.title || !body.title.trim()) return reply.status(400).send({ error: 'Titel erforderlich.' });
    const ts = nowIso();
    const row = {
      id: uuid(), listId: id, title: body.title.trim(), description: body.description || '',
      dueDate: body.dueDate || null, priority: body.priority || 'medium', status: 'todo' as TaskStatus,
      sortOrder: Date.now(), assigneeId: body.assigneeId || null, recurrence: body.recurrence || null,
      version: 1, createdBy: req.user!.id, createdAt: ts, updatedAt: ts, completedAt: null, dueNotified: false
    };
    await getDb().insert(tasks).values(row);
    const labelIds = body.labelIds || [];
    for (const lid of new Set(labelIds)) {
      await getDb().insert(taskLabels).values({ taskId: row.id, labelId: lid }).onConflictDoNothing();
    }
    await publishSyncEvent('task:created', { listId: id, taskId: row.id, actorId: req.user!.id });
    await audit(req.user!, 'task:created', 'task', row.id, { listId: id }, req.clientIp);
    return { ...row, labels: [], subtasks: [] };
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const task = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1).then((r) => r[0]);
    if (!task) return reply.status(404).send({ error: 'Aufgabe nicht gefunden.' });
    const membership = await getListMembership(task.listId, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: nowIso(), version: (task.version || 0) + 1 };
    for (const key of ['title', 'description', 'dueDate', 'priority', 'assigneeId', 'recurrence']) {
      if (key in body) update[key] = body[key] === '' ? null : body[key];
    }
    if ('status' in body) {
      update.status = body.status;
      update.completedAt = body.status === 'done' ? nowIso() : null;
    }
    if ('labelIds' in body) {
      const target: string[] = Array.isArray(body.labelIds) ? body.labelIds.map(String) : [];
      const existing = await getDb().select().from(taskLabels).where(eq(taskLabels.taskId, task.id));
      for (const e of existing) {
        if (!target.includes(e.labelId)) await getDb().delete(taskLabels).where(and(eq(taskLabels.taskId, task.id), eq(taskLabels.labelId, e.labelId)));
      }
      for (const lid of target) {
        await getDb().insert(taskLabels).values({ taskId: task.id, labelId: lid }).onConflictDoNothing();
      }
    }
    await getDb().update(tasks).set(update).where(eq(tasks.id, id));
    const fresh = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1).then((r) => r[0]);
    await publishSyncEvent('task:updated', { listId: task.listId, taskId: task.id, data: fresh, actorId: req.user!.id });

    if (fresh.status === 'done' && fresh.recurrence) {
      const due = fresh.dueDate ? new Date(fresh.dueDate) : new Date();
      const nextDue = nextRecurringDue(fresh.recurrence, due);
      const rule = { ...fresh.recurrence, generated: (fresh.recurrence.generated || 0) + 1 };
      const endReached = (rule.endDate && nextDue > new Date(rule.endDate)) || (rule.count !== undefined && rule.count > 0 && rule.generated >= rule.count);
      if (!endReached) {
        const subs = await getDb().select().from(subtasks).where(eq(subtasks.taskId, fresh.id));
        const nextId = uuid();
        const ts2 = nowIso();
        await getDb().insert(tasks).values({
          ...fresh, id: nextId, listId: fresh.listId, status: 'todo', completedAt: null, dueDate: nextDue.toISOString(),
          recurrence: rule, sortOrder: fresh.sortOrder + 0.5, version: 1, createdAt: ts2, updatedAt: ts2, dueNotified: false,
          createdBy: fresh.createdBy
        });
        for (const s of subs) {
          await getDb().insert(subtasks).values({ id: uuid(), taskId: nextId, title: s.title, done: false, createdAt: ts2 });
        }
        await publishSyncEvent('task:created', { listId: fresh.listId, taskId: nextId, actorId: req.user!.id });
      }
    }
    return { ok: true, task: fresh };
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const task = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1).then((r) => r[0]);
    if (!task) return reply.status(404).send({ error: 'Aufgabe nicht gefunden.' });
    const membership = await getListMembership(task.listId, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    await getDb().delete(tasks).where(eq(tasks.id, id));
    await publishSyncEvent('task:deleted', { listId: task.listId, taskId: id, actorId: req.user!.id });
    await audit(req.user!, 'task:deleted', 'task', id, { listId: task.listId }, req.clientIp);
    return { ok: true };
  });

  app.put('/api/lists/:id/reorder', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const { taskIds } = req.body as { taskIds?: string[] };
    if (!Array.isArray(taskIds)) return reply.status(400).send({ error: 'taskIds erforderlich.' });
    const membership = await getListMembership(id, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const existing = await getDb().select().from(tasks).where(eq(tasks.listId, id));
    const order = new Map(taskIds.map((tid, i) => [tid, i]));
    for (const t of existing) {
      if (order.has(t.id)) {
        await getDb().update(tasks).set({ sortOrder: (order.get(t.id) as number) + 1 }).where(eq(tasks.id, t.id));
      }
    }
    await publishSyncEvent('task:reordered', { listId: id, taskIds, actorId: req.user!.id });
    return { ok: true };
  });

  app.post('/api/tasks/:id/subtasks', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const task = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1).then((r) => r[0]);
    if (!task) return reply.status(404).send({ error: 'Aufgabe nicht gefunden.' });
    const membership = await getListMembership(task.listId, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const { title } = req.body as { title?: string };
    if (!title || !title.trim()) return reply.status(400).send({ error: 'Titel erforderlich.' });
    const row = { id: uuid(), taskId: id, title: title.trim(), done: false, createdAt: nowIso() };
    await getDb().insert(subtasks).values(row);
    await publishSyncEvent('task:updated', { listId: task.listId, taskId: task.id, subAdded: row, actorId: req.user!.id });
    return row;
  });

  app.patch('/api/subtasks/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const sub = await getDb().select().from(subtasks).where(eq(subtasks.id, id)).limit(1).then((r) => r[0]);
    if (!sub) return reply.status(404).send({ error: 'Subtask nicht gefunden.' });
    const task = await getDb().select().from(tasks).where(eq(tasks.id, sub.taskId)).limit(1).then((r) => r[0]);
    if (!task) return reply.status(404).send({ error: 'Aufgabe nicht gefunden.' });
    const membership = await getListMembership(task.listId, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    const { title, done } = req.body as { title?: string; done?: boolean };
    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = title.trim();
    if (done !== undefined) update.done = !!done;
    await getDb().update(subtasks).set(update).where(eq(subtasks.id, id));
    const fresh = await getDb().select().from(subtasks).where(eq(subtasks.id, id)).limit(1).then((r) => r[0]);
    await publishSyncEvent('task:updated', { listId: task.listId, taskId: task.id, subUpdated: fresh, actorId: req.user!.id });
    return fresh;
  });

  app.delete('/api/subtasks/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const sub = await getDb().select().from(subtasks).where(eq(subtasks.id, id)).limit(1).then((r) => r[0]);
    if (!sub) return reply.status(404).send({ error: 'Subtask nicht gefunden.' });
    const task = await getDb().select().from(tasks).where(eq(tasks.id, sub.taskId)).limit(1).then((r) => r[0]);
    if (!task) return reply.status(404).send({ error: 'Aufgabe nicht gefunden.' });
    const membership = await getListMembership(task.listId, req.user!.id);
    if (!canEditByRole(membership?.role)) return reply.status(403).send({ error: 'Keine Bearbeitungsrechte.' });
    await getDb().delete(subtasks).where(eq(subtasks.id, id));
    await publishSyncEvent('task:updated', { listId: task.listId, taskId: task.id, subDeleted: id, actorId: req.user!.id });
    return { ok: true };
  });
}