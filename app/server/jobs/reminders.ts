import cron from 'node-cron';
import { and, eq, lt, gte } from 'drizzle-orm';
import { getDb, tasks, users, listMembers, lists } from '@dockdo/shared';
import type { FastifyInstance } from 'fastify';
import { sendEmail } from '../routes/push';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function dueLabel(dueMs: number): string {
  return new Date(dueMs).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function describeDue(dueMs: number, now: number): string {
  const diff = dueMs - now;
  if (diff <= 0) return 'überfällig';
  const min = Math.round(diff / MIN);
  if (min < 60) return `in ${min} Minute${min === 1 ? '' : 'n'}`;
  const hours = Math.round(diff / (60 * MIN));
  if (hours < 24) return `in ${hours} Stunde${hours === 1 ? '' : 'n'}`;
  const days = Math.round(diff / DAY);
  return `in ${days} Tag${days === 1 ? '' : 'en'}`;
}

async function sendReminderForTask(app: FastifyInstance, taskId: string): Promise<void> {
  const task = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1).then((r) => r[0]);
  if (!task || !task.dueDate || task.dueNotified || task.status === 'done' || task.status === 'cancelled') return;
  const memberRows = await getDb().select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, task.listId));
  const list = await getDb().select().from(lists).where(eq(lists.id, task.listId)).limit(1).then((r) => r[0]);
  const notifyUserIds = memberRows.map((m) => m.userId);
  const usersRows = notifyUserIds.length
    ? await getDb().select().from(users).where(and(...notifyUserIds.map((id) => eq(users.id, id))))
    : [];

  const dueMs = new Date(task.dueDate).getTime();
  const now = Date.now();
  const overdue = dueMs <= now;
  const label = dueLabel(dueMs);
  let sent = false;

  for (const user of usersRows) {
    const prefs = (user.notif || {}) as Record<string, unknown>;
    const push = prefs.push !== false;
    const email = prefs.email === true;
    const offsetMin = typeof prefs.dueOffsetMin === 'number' ? prefs.dueOffsetMin : 60;
    if (!overdue && now < dueMs - Math.max(0, offsetMin) * MIN) continue;

    const source = list?.name || 'DockDo';
    const heading = overdue ? 'Frist abgelaufen' : 'Erinnerung';
    const title = `${source}: ${heading}`;
    const body = overdue
      ? `"${task.title}" ist überfällig (fällig war ${label})`
      : `"${task.title}" ist ${describeDue(dueMs, now)} fällig (${label})`;

    if (push) {
      const { sendPush } = await import('../routes/push');
      await sendPush(app, user.id, title, body, `/list/${task.listId}`);
    }
    if (email) {
      await sendEmail(app, user.email, title,
        `<h2>${heading}</h2><p><strong>${task.title}</strong></p><p>${overdue ? 'Diese Aufgabe ist überfällig.' : 'Diese Aufgabe wird bald fällig.'}</p><p>Fällig am: ${label}</p><p><a href="${app.config.publicAppUrl}/list/${task.listId}">Zur Aufgabe</a></p>`);
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
      const start = new Date(Date.now() - 7 * DAY).toISOString();
      const end = new Date(Date.now() + 7 * DAY).toISOString();
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