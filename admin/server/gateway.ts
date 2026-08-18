import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findSessionByToken, getSessionTokenFromCookie, type Config, type User } from '@dockdo/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    sessionId?: string;
    clientIp?: string;
  }
  interface FastifyInstance {
    config: Config;
    source: string;
  }
}

export function registerAdminAuthHook(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    req.clientIp = req.ip;
    const token = getSessionTokenFromCookie(req.headers.cookie);
    if (token) {
      const found = await findSessionByToken(token);
      if (found) {
        req.user = found.user;
        req.sessionId = found.session.id;
      }
    }
  });
}

const PUBLIC_PATHS = ['/api/admin/login', '/health'];

export function gateway(req: FastifyRequest, reply: FastifyReply): boolean {
  const url = (req.url || '').split('?')[0];
  if (PUBLIC_PATHS.includes(url)) return true;
  if (!url.startsWith('/api/') && !url.startsWith('/_internal/')) return true;
  if (!req.user) {
    reply.status(401).send({ error: 'Nicht angemeldet' });
    return false;
  }
  if (req.user.role !== 'admin') {
    reply.status(403).send({ error: 'Admin-Zugriff erforderlich.' });
    return false;
  }
  return true;
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  return gateway(req, reply);
}