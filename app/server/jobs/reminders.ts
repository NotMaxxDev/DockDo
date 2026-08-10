import cron from 'node-cron';
import { and, eq, lt, gte } from 'drizzle-orm';
import { getDb, tasks, users, listMembers, lists } from '@dockdo/shared';
import type { FastifyInstance } from 'fastify';
import { sendEmail } from '../routes/push';

const MIN = 60 * 1000;

async function sendReminderForTask(app: FastifyInstance, taskId: string): Promise<void> {
  const task = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1).then((r) => r[0]);
  if (!task || !task.dueDate || task.dueNotified || task.status === 'done' || task.status === 'cancelled') return;
  const memberRows = await getDb().select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, task.listId));
  const list = await getDb().select().from(lists).where(eq(lists.id, task.listId)).limit(1).then((r) => r[0]);
  const notifyUserIds = memberRows.map((m) => m.userId);
  const usersRows = notifyUserIds.length
    ? await getDb().select().from(users).where(and(...notifyUserIds.map((id) => eq(users.id, id))))
    : [];
  const dueLabel = new Date(task.dueDate).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  let sent = false;
  for (const user of usersRows) {
    const prefs = (user.notif || {}) as Record<string, unknown>;
    const push = prefs.push !== false;
    const email = prefs.email === true;
    const reminderLead = typeof task.dueDate === 'string' ? task.dueDate : '';
    void reminderLead;
    if (push) {
      const { sendPush } = await import('../routes/push');
      await sendPush(app, user.id, `${list?.name || 'DockDo'}: Fällig heute`, `"${task.title}" ist fällig (${dueLabel})`, `/list/${task.listId}`);
    }
    if (email) {
      await sendEmail(app, user.email, `${list?.name || 'DockDo'}: "${task.title}" ist fällig`,
        `<h2>Fällige Aufgabe</h2><p><strong>${task.title}</strong></p><p>Fällig am: ${dueLabel}</p><p><a href="${app.config.publicAppUrl}/list/${task.listId}">Zur Aufgabe</a></p>`);
    }
    sent = true;
  }
  if (sent) {
    await getDb().update(tasks).set({ dueNotified: true }).where(eq(tasks.id, task.id));
  }
}

export function startReminderJob(app: FastifyInstance): void {
  cron.schedule('* * * * *', async () => {
    try {
      const start = new Date(Date.now() - MIN).toISOString();
      const end = new Date(Date.now() + 5 * MIN).toISOString();
      const rows = await getDb()
        .select()
        .from(tasks)
        .where(and(gte(tasks.dueDate, start), lt(tasks.dueDate, end), eq(tasks.dueNotified, false)));
      for (const t of rows) {
        await sendReminderForTask(app, t.id).catch((err) => console.error('reminder failed', err));
      }
    } catch {
      /* ignore */
    }
  });
}