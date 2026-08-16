import type { FastifyInstance } from 'fastify';
import { eq, desc, like, or } from 'drizzle-orm';
import {
  getDb, auditLogs, appEvents, audit, setSetting, getSmtpSettings,
  saveSmtpSettings, getGeneralSettings, saveGeneralSettings, loadConfig,
  getSecuritySettings, saveSecuritySettings,
  formatBytes
} from '@dockdo/shared';
import { requireAdmin } from '../gateway';

export function registerLogRoutes(app: FastifyInstance): void {
  app.get('/api/admin/audit', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = (req.query as Record<string, string | undefined>) || {};
    const limit = Math.min(200, Number(q.limit) || 50);
    let rows = await getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
    if (q.search) {
      const s = String(q.search).toLowerCase();
      rows = rows.filter((r) => (r.action || '').toLowerCase().includes(s) || (r.actorEmail || '').toLowerCase().includes(s) || String(r.targetId || '').includes(s));
    }
    return rows.slice(0, limit).map((r) => ({
      id: r.id, actorEmail: r.actorEmail, action: r.action, targetType: r.targetType,
      targetId: r.targetId, details: r.details, ip: r.ip, createdAt: r.createdAt
    }));
  });

  app.get('/api/admin/errors', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = (req.query as Record<string, string | undefined>) || {};
    const limit = Math.min(200, Number(q.limit) || 50);
    let rows = await getDb().select().from(appEvents).where(eq(appEvents.level, 'error')).orderBy(desc(appEvents.createdAt));
    return rows.slice(0, limit).map((r) => ({ id: r.id, level: r.level, source: r.source, message: r.message, meta: r.meta, createdAt: r.createdAt }));
  });
}

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/admin/settings', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const smtp = await getSmtpSettings();
    const general = await getGeneralSettings();
    const security = await getSecuritySettings();
    const cfg = loadConfig();
    return {
      smtp,
      general: { ...general, vapidPrivateKey: general.vapidPrivateKey ? '••••••••' : '' },
      security,
      system: {
        dbMode: cfg.dbMode,
        dataDir: cfg.dataDir,
        appPort: cfg.appPort,
        adminPort: cfg.adminPort,
        publicAppUrl: cfg.publicAppUrl,
        publicAdminUrl: cfg.publicAdminUrl,
        node: process.version,
        platform: process.platform
      }
    };
  });

  app.put('/api/admin/settings/smtp', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as Partial<ReturnType<typeof getSmtpSettings> extends Promise<infer T> ? T : never>;
    const smtp = await getSmtpSettings();
    const merged = { ...smtp, ...body };
    if (merged.password === '••••••••') merged.password = smtp.password;
    await saveSmtpSettings(merged);
    await audit(req.user!, 'settings:smtp-updated', 'system', undefined, {}, req.clientIp);
    return { ok: true };
  });

  app.post('/api/admin/settings/smtp/test', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    try {
      const nodemailer = (await import('nodemailer')).default;
      const smtp = await getSmtpSettings();
      if (!smtp.host) return reply.status(400).send({ error: 'SMTP ist nicht konfiguriert.' });
      const transporter = nodemailer.createTransport({
        host: smtp.host, port: smtp.port, secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
        tls: { rejectUnauthorized: false }
      });
      await transporter.verify();
      await audit(req.user!, 'settings:smtp-test', 'system', undefined, { ok: true }, req.clientIp);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: 'SMTP-Test fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)) });
    }
  });

  app.get('/api/admin/settings/security', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return await getSecuritySettings();
  });

  app.put('/api/admin/settings/security', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { csrfEnabled?: boolean };
    const s = await getSecuritySettings();
    if (typeof body.csrfEnabled === 'boolean') s.csrfEnabled = body.csrfEnabled;
    await saveSecuritySettings(s);
    await audit(req.user!, 'settings:security-updated', 'system', undefined, { csrfEnabled: s.csrfEnabled }, req.clientIp);
    return { ok: true, security: s };
  });

  app.put('/api/admin/settings/general', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { appName?: string; registrationDescription?: string; vapidSubject?: string };
    const g = await getGeneralSettings();
    if (body.appName) g.appName = body.appName.trim().slice(0, 60);
    if (body.registrationDescription !== undefined) g.registrationDescription = body.registrationDescription;
    if (body.vapidSubject !== undefined) g.vapidSubject = body.vapidSubject;
    await saveGeneralSettings(g);
    await audit(req.user!, 'settings:general-updated', 'system', undefined, { fields: Object.keys(body) }, req.clientIp);
    return { ok: true };
  });
}

export async function dbSize(): Promise<number> {
  const cfg = loadConfig();
  if (cfg.dbMode === 'sqlite') {
    const fs = await import('fs');
    const p = require('path').join(cfg.dataDir, 'dockdo.db');
    if (fs.existsSync(p)) return fs.statSync(p).size;
    return 0;
  }
  return 0;
}