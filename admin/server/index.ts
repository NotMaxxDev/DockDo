import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import * as fs from 'fs';
import {
  loadConfig, initDatabase, createDefaultThemeIfMissing, seedPresetThemes, getGeneralSettings,
  cleanupStale, setSetting, csrfToken, verifyCsrf, cookieOptions,
  getSessionTokenFromCookie, findSessionByToken, uuid, nowIso, getDb,
  settings, ensureSelfSignedCert
} from '@dockdo/shared';
import { registerAdminAuthHook, gateway } from './gateway';
import { registerAdminAuthRoutes, adminStats } from './routes/auth';
import { registerUserRoutes } from './routes/users';
import { registerAdminListRoutes } from './routes/lists';
import { registerAdminAuthConfigRoutes } from './routes/auth-config';
import { registerThemeRoutes } from './routes/themes';
import { registerBackupRoutes, rescheduleAll } from './routes/backups';
import { registerLogRoutes, registerSettingsRoutes, dbSize } from './routes/logs-settings';
import { cleanupRestoreTmp } from './services/backup';

const CSRF = 'dockdo_admin_csrf';

export async function main(): Promise<void> {
  const config = loadConfig();
  fs.mkdirSync(config.dataDir, { recursive: true });
  const { keyPath, certPath } = ensureSelfSignedCert(config.dataDir);
  await initDatabase(config, 'admin');
  await createDefaultThemeIfMissing();
  await seedPresetThemes();

  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 4 * 1024 * 1024,
    https: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }
  });
  app.config = config;
  app.source = 'admin';

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false });
  await app.register(fastifyRateLimit, { max: 300, timeWindow: '1 minute' });

  app.decorateRequest('user', undefined);
  app.decorateRequest('sessionId', undefined);
  registerAdminAuthHook(app);

  app.addHook('preHandler', async (req, reply) => {
    const url = (req.url || '').split('?')[0];
    if (!gateway(req, reply)) return;
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (!req.user) return;
    if (url.startsWith('/api/admin/login') || url.startsWith('/api/admin/totp')) return;
    const raw = req.headers.cookie || '';
    const cookies = Object.fromEntries(raw.split(';').filter(Boolean).map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }));
    const header = String(req.headers['x-csrf-token'] || '');
    if (!verifyCsrf(cookies[CSRF], header, req.user.id)) {
      return reply.status(403).send({ error: 'CSRF-Schutz verweigert die Anfrage.' });
    }
  });

  app.get('/health', async () => {
    try {
      await getGeneralSettings();
      return { ok: true, service: 'admin', uptime: Math.round(process.uptime()) };
    } catch {
      return { ok: false };
    }
  });

  registerAdminAuthRoutes(app);
  registerUserRoutes(app);
  registerAdminListRoutes(app);
  registerAdminAuthConfigRoutes(app);
  registerThemeRoutes(app);
  registerBackupRoutes(app);
  registerLogRoutes(app);
  registerSettingsRoutes(app);

  app.get('/api/admin/dashboard', async (req, reply) => {
    if (!gateway(req, reply)) return;
    const stats = await adminStats(app);
    const size = await dbSize();
    return {
      ...stats,
      dbSizeBytes: size,
      dbSize: format(size),
      dbMode: config.dbMode,
      uptimeAdmin: Math.round(process.uptime())
    };
  });

  app.post('/_internal/admin/csrf', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const opts = cookieOptions({ publicUrl: config.publicAdminUrl, cookieSecret: config.cookieSecret }, 86400);
    reply.setCookie(CSRF, csrfToken(req.user.id), { ...opts, httpOnly: false });
    return { csrf: csrfToken(req.user.id) };
  });

  const distDir = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(distDir)) {
    await app.register(fastifyStatic, { root: distDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
      return reply.type('text/html').send(fs.readFileSync(path.join(distDir, 'index.html')));
    });
  }

  void cleanupStale();
  setInterval(() => void cleanupStale(), 60 * 60 * 1000);
  await rescheduleAll(app);
  cleanupRestoreTmp();

  await app.listen({ port: config.adminPort, host: config.host });
  console.log(`[admin] DockDo Admin-Server läuft auf https://${config.host}:${config.adminPort} (DB: ${config.dbMode}, Daten: ${config.dataDir})`);
}

function format(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[admin] Fatal:', err);
    process.exit(1);
  });
}