import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import * as path from 'path';
import * as fs from 'fs';
import {
  loadConfig, initDatabase, createDefaultThemeIfMissing, getAuthSettings,
  getGeneralSettings, logAppEvent, cleanupStale, setSetting
} from '@dockdo/shared';
import { registerAuthPlugin, csrfCookieName } from './plugins';
import { registerMetaRoutes, registerSetupRoutes } from './routes/setup';
import { registerAuthRoutes } from './routes/auth';
import { registerMeRoutes } from './routes/me';
import { registerListRoutes } from './routes/lists';
import { registerTaskRoutes } from './routes/tasks';
import { registerCommentRoutes, registerSearchRoutes } from './routes/comments-search';
import { registerPushRoutes } from './routes/push';
import { registerWs } from './ws/hub';
import { startReminderJob } from './jobs/reminders';
import { getSessionTokenFromCookie, findSessionByToken, verifyCsrf, csrfToken, cookieOptions } from '@dockdo/shared';

export async function main(): Promise<void> {
  const config = loadConfig();
  fs.mkdirSync(config.dataDir, { recursive: true });
  await initDatabase(config, 'app');
  const themeId = await createDefaultThemeIfMissing();
  if (themeId) void themeId;

  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024
  });
  app.config = config;
  app.source = 'app';

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  });
  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: '1 minute'
  });
  await app.register(websocket);

  app.decorateRequest('user', undefined);
  app.decorateRequest('sessionId', undefined);
  registerAuthPlugin(app);

  app.addHook('preHandler', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const routeUrl = req.routeOptions?.url || '';
    if (routeUrl.startsWith('/ws') || routeUrl.startsWith('/api/auth/login') || routeUrl.startsWith('/api/auth/totp') || routeUrl.startsWith('/api/setup')) return;
    if (!req.user) return;
    const cookieName = csrfCookieName('app');
    const raw = req.headers.cookie || '';
    const cookies = Object.fromEntries(raw.split(';').filter(Boolean).map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }));
    const header = String(req.headers['x-csrf-token'] || '');
    if (!verifyCsrf(cookies[cookieName], header, req.user.id)) {
      return reply.status(403).send({ error: 'CSRF-Schutz verweigert die Anfrage.' });
    }
  });

  await app.register(registerMetaRoutes);
  await app.register(registerSetupRoutes);
  await app.register(registerAuthRoutes);
  await app.register(registerMeRoutes);
  await app.register(registerListRoutes);
  await app.register(registerTaskRoutes);
  await app.register(registerCommentRoutes);
  await app.register(registerSearchRoutes);
  await app.register(registerPushRoutes);

  registerWs(app);

  app.get('/health', async () => {
    try {
      await getGeneralSettings();
      return { ok: true, service: 'app', uptime: Math.round(process.uptime()) };
    } catch {
      return { ok: false };
    }
  });

  app.post('/_internal/csrf', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const opts = cookieOptions({ publicUrl: config.publicAppUrl, cookieSecret: config.cookieSecret }, 86400);
    reply.setCookie(csrfCookieName('app'), csrfToken(req.user.id), { ...opts, httpOnly: false });
    return { csrf: csrfToken(req.user.id) };
  });

  app.get('/_internal/vapid', async () => {
    const general = await getGeneralSettings();
    return { vapidPublicKey: general.vapidPublicKey || '' };
  });

  const distDir = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(distDir)) {
    await app.register(fastifyStatic, { root: distDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/') || req.raw.url?.startsWith('/ws')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.type('text/html').send(fs.readFileSync(path.join(distDir, 'index.html')));
    });
  }

  startReminderJob(app);
  void cleanupStale();
  setInterval(() => void cleanupStale(), 60 * 60 * 1000);
  setInterval(() => void heartbeat(app), 15000);

  await app.listen({ port: config.appPort, host: config.host });
  console.log(`[app] DockDo App-Server läuft auf http://${config.host}:${config.appPort} (DB: ${config.dbMode}, Daten: ${config.dataDir})`);
}

async function heartbeat(app: FastifyInstance): Promise<void> {
  try {
    const { wsConnectionsCount$ } = await import('./jobs/stats');
    await setSetting('heartbeat', { wsConnections: wsConnectionsCount$(), lastSeen: new Date().toISOString(), uptime: Math.round(process.uptime()) });
  } catch {
    /* ignore */
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[app] Fatal:', err);
    process.exit(1);
  });
}