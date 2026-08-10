import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import {
  getDb, backupTargets, backupJobs, backups, audit, nowIso, uuid,
  type BackupTarget
} from '@dockdo/shared';
import { requireAdmin } from '../gateway';
import { runBackup, restoreBackup } from '../services/backup';

export function registerBackupRoutes(app: FastifyInstance): void {
  app.get('/api/admin/backup-targets', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = await getDb().select().from(backupTargets).orderBy(backupTargets.createdAt);
    return rows.map((t) => ({ ...t, config: maskConfig(t) }));
  });

  app.post('/api/admin/backup-targets', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { name?: string; type?: 'local' | 's3' | 'smb'; config?: Record<string, unknown>; enabled?: boolean };
    if (!body.name || !['local', 's3', 'smb'].includes(body.type || '')) return reply.status(400).send({ error: 'Name und Typ erforderlich.' });
    const ts = nowIso();
    const row = {
      id: uuid(), name: body.name.trim(), type: body.type as 'local' | 's3' | 'smb',
      config: body.config || {}, enabled: body.enabled ?? true, createdAt: ts, updatedAt: ts
    };
    await getDb().insert(backupTargets).values(row);
    await audit(req.user!, 'backup:target-created', 'backup_target', row.id, { type: row.type, name: row.name }, req.clientIp);
    return row;
  });

  app.put('/api/admin/backup-targets/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const target = await getDb().select().from(backupTargets).where(eq(backupTargets.id, id)).limit(1).then((r) => r[0]);
    if (!target) return reply.status(404).send({ error: 'Ziel nicht gefunden.' });
    const body = req.body as { name?: string; config?: Record<string, unknown>; enabled?: boolean };
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (body.name) update.name = body.name.trim();
    if (body.enabled !== undefined) update.enabled = !!body.enabled;
    if (body.config) {
      const merged = { ...(target.config as Record<string, unknown>), ...body.config };
      const cfg = body.config;
      if (cfg.secretAccessKey === '••••••••') merged.secretAccessKey = target.config.secretAccessKey;
      if (cfg.password === '••••••••') merged.password = target.config.password;
      update.config = merged;
    }
    await getDb().update(backupTargets).set(update).where(eq(backupTargets.id, id));
    await audit(req.user!, 'backup:target-updated', 'backup_target', id, { fields: Object.keys(update) }, req.clientIp);
    const fresh = await getDb().select().from(backupTargets).where(eq(backupTargets.id, id)).limit(1).then((r) => r[0]);
    return { ok: true, target: fresh };
  });

  app.delete('/api/admin/backup-targets/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const jobs = await getDb().select().from(backupJobs).where(eq(backupJobs.targetId, id));
    for (const j of jobs) await getDb().delete(backupJobs).where(eq(backupJobs.id, j.id));
    await getDb().delete(backups).where(eq(backups.targetId, id));
    await getDb().delete(backupTargets).where(eq(backupTargets.id, id));
    await audit(req.user!, 'backup:target-deleted', 'backup_target', id, {}, req.clientIp);
    return { ok: true };
  });

  app.get('/api/admin/backup-jobs', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = await getDb().select().from(backupJobs).orderBy(backupJobs.createdAt);
    const targets = await getDb().select().from(backupTargets);
    return rows.map((j) => ({ ...j, targetName: targets.find((t) => t.id === j.targetId)?.name || 'Unbekannt' }));
  });

  app.post('/api/admin/backup-jobs', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { name?: string; targetId?: string; schedule?: string; retention?: { daily: number; weekly: number; monthly: number }; enabled?: boolean };
    if (!body.name || !body.targetId) return reply.status(400).send({ error: 'Name und Ziel erforderlich.' });
    if (!body.schedule || !isValidCron(body.schedule)) return reply.status(400).send({ error: 'Ungültiger Cron-Ausdruck (5 Felder).' });
    const target = await getDb().select().from(backupTargets).where(eq(backupTargets.id, body.targetId)).limit(1).then((r) => r[0]);
    if (!target) return reply.status(404).send({ error: 'Ziel nicht gefunden.' });
    const row = {
      id: uuid(), name: body.name.trim(), targetId: body.targetId, schedule: body.schedule,
      retention: { daily: Number(body.retention?.daily) || 7, weekly: Number(body.retention?.weekly) || 4, monthly: Number(body.retention?.monthly) || 12 },
      enabled: body.enabled ?? true, lastRunAt: null, lastStatus: null, lastError: null, createdAt: nowIso()
    };
    await getDb().insert(backupJobs).values(row);
    scheduleJob(app, row as never);
    await audit(req.user!, 'backup:job-created', 'backup_job', row.id, { schedule: row.schedule }, req.clientIp);
    return row;
  });

  app.put('/api/admin/backup-jobs/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const job = await getDb().select().from(backupJobs).where(eq(backupJobs.id, id)).limit(1).then((r) => r[0]);
    if (!job) return reply.status(404).send({ error: 'Job nicht gefunden.' });
    const body = req.body as { name?: string; schedule?: string; retention?: { daily: number; weekly: number; monthly: number }; enabled?: boolean; targetId?: string };
    const update: Record<string, unknown> = {};
    if (body.name) update.name = body.name.trim();
    if (body.targetId) {
      const target = await getDb().select().from(backupTargets).where(eq(backupTargets.id, body.targetId)).limit(1).then((r) => r[0]);
      if (!target) return reply.status(404).send({ error: 'Ziel nicht gefunden.' });
      update.targetId = body.targetId;
    }
    if (body.schedule) {
      if (!isValidCron(body.schedule)) return reply.status(400).send({ error: 'Ungültiger Cron-Ausdruck.' });
      update.schedule = body.schedule;
    }
    if (body.retention) update.retention = body.retention;
    if (body.enabled !== undefined) update.enabled = !!body.enabled;
    await getDb().update(backupJobs).set(update).where(eq(backupJobs.id, id));
    await audit(req.user!, 'backup:job-updated', 'backup_job', id, { fields: Object.keys(update) }, req.clientIp);
    rescheduleAll(app);
    return { ok: true };
  });

  app.delete('/api/admin/backup-jobs/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    await getDb().delete(backupJobs).where(eq(backupJobs.id, id));
    await audit(req.user!, 'backup:job-deleted', 'backup_job', id, {}, req.clientIp);
    rescheduleAll(app);
    return { ok: true };
  });

  app.post('/api/admin/backups/run', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { targetId, jobId } = req.body as { targetId?: string; jobId?: string };
    if (!targetId) return reply.status(400).send({ error: 'targetId erforderlich.' });
    try {
      await runBackup(jobId || null, targetId, req.user!.id);
      await audit(req.user!, 'backup:manual-run', 'backup_target', targetId, {}, req.clientIp);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/admin/backups', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = await getDb().select().from(backups).orderBy(desc(backups.createdAt)).limit(200);
    const targets = await getDb().select().from(backupTargets);
    const jobs = await getDb().select().from(backupJobs);
    return rows.map((b) => ({
      id: b.id, filename: b.filename, size: b.size, status: b.status, createdAt: b.createdAt,
      targetId: b.targetId, targetName: targets.find((t) => t.id === b.targetId)?.name || 'Unbekannt',
      jobName: b.jobId ? jobs.find((j) => j.id === b.jobId)?.name : undefined
    }));
  });

  app.post('/api/admin/backups/:id/restore', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const { confirm } = req.body as { confirm?: string };
    if (!confirm || confirm !== 'RESTORE') return reply.status(400).send({ error: 'Bitte "RESTORE" zur Bestätigung eingeben.' });
    try {
      await restoreBackup(id, { id: req.user!.id, email: req.user!.email });
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}

function maskConfig(t: BackupTarget): Record<string, unknown> {
  const cfg = { ...(t.config as Record<string, unknown>) };
  if (cfg.secretAccessKey) cfg.secretAccessKey = '••••••••';
  if (cfg.password) cfg.password = '••••••••';
  return cfg;
}

const cronTasks = new Map<string, ReturnType<typeof setInterval>>();
let cronCtor: ((expr: string, fn: () => void) => { start: () => unknown; stop: () => unknown }) | null = null;

export function isValidCron(expr: string): boolean {
  if (!cronCtor) {
    try {
      cronCtor = require('node-cron').schedule as never;
    } catch {
      return /^(\*|[0-9]+)(\/[0-9]+)?(\s+(\*|[0-9]+)(\/[0-9]+)?){4}$/.test(expr);
    }
  }
  return /^(?:[0-5]?\d|\*|\d+-\d+|\*\/\d+)(?:,[0-5]?\d)* +(?:[01]?\d|2[0-3]|\*|\d+-\d+|\*\/\d+)(?:,[01]?\d|,2[0-3])* +(?:[1-9]|[12]\d|3[01]|\*|\d+-\d+|\*\/\d+)(?:,[1-9]|,[12]\d|,3[01])* +(?:[1-9]|1[0-2]|\*|\d+-\d+|\*\/\d+)(?:,[1-9]|,1[0-2])* +(?:[0-6]|\*|\d+-\d+|\*\/\d+)(?:,[0-6])*$/.test(expr.trim());
}

export function scheduleJob(app: FastifyInstance, job: { id: string; schedule: string; enabled: boolean; targetId: string }): void {
  const existing = cronTasks.get(job.id);
  if (existing) {
    clearInterval(existing);
    cronTasks.delete(job.id);
  }
  if (!job.enabled) return;
  const cron = require('node-cron');
  const task = cron.schedule(job.schedule, () => {
    void runBackup(job.id, job.targetId).catch((err) => console.error('[backup-job]', job.id, err));
  });
  cronTasks.set(job.id, task as never);
  task.start();
}

export async function rescheduleAll(app: FastifyInstance): Promise<void> {
  for (const [, t] of cronTasks) clearInterval(t as never);
  cronTasks.clear();
  const jobs = await getDb().select().from(backupJobs).where(eq(backupJobs.enabled, true));
  for (const j of jobs) scheduleJob(app, j as never);
}