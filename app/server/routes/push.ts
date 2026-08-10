import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb, pushSubscriptions, audit, nowIso, uuid } from '@dockdo/shared';
import { requireAuth } from '../plugins';

export async function registerPushRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/push/subscribe', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh: string; auth: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth) return reply.status(400).send({ error: 'Ungültige Subscription.' });
    const existing = await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1).then((r) => r[0]);
    if (existing) {
      await getDb().update(pushSubscriptions).set({ keys, userId: req.user!.id }).where(eq(pushSubscriptions.id, existing.id));
      return { ok: true };
    }
    await getDb().insert(pushSubscriptions).values({ id: uuid(), userId: req.user!.id, endpoint, keys, createdAt: nowIso() });
    await audit(req.user!, 'push:subscribed', 'user', req.user!.id, {}, req.clientIp);
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) return reply.status(400).send({ error: 'endpoint erforderlich.' });
    await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    return { ok: true };
  });
}

export async function sendPush(app: FastifyInstance, userId: string, title: string, body: string, url?: string): Promise<void> {
  const { getGeneralSettings } = await import('@dockdo/shared');
  const general = await getGeneralSettings();
  if (!general.vapidPublicKey || !general.vapidPrivateKey) return;
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(general.vapidSubject || 'mailto:admin@localhost', general.vapidPublicKey, general.vapidPrivateKey);
  const subs = await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title, body, url: url || '/' }),
          { TTL: 60 * 60 }
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
      }
    })
  );
}

export async function sendEmail(app: FastifyInstance, to: string, subject: string, html: string): Promise<boolean> {
  const { getSmtpSettings } = await import('@dockdo/shared');
  const smtp = await getSmtpSettings();
  if (!smtp.host) return false;
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined
  });
  try {
    await transporter.sendMail({ from: smtp.from, to, subject, html });
    return true;
  } catch (err) {
    const { logAppEvent } = await import('@dockdo/shared');
    await logAppEvent('error', 'email', 'Senden fehlgeschlagen', { to, error: String(err) });
    return false;
  }
}