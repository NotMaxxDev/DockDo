import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findSessionByToken, getSessionTokenFromCookie, parseCookies, type Config } from '@dockdo/shared';
import type { User } from '@dockdo/shared';

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

export function registerAuthPlugin(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    req.clientIp = req.ip;
    if (req.routeOptions?.url?.startsWith('/ws')) return;
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

export interface PermissionCheck {
  ok: boolean;
  reply?: (r: FastifyReply) => void;
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.user) {
    reply.status(401).send({ error: 'Nicht angemeldet' });
    return false;
  }
  return true;
}

export function logoutSession(req: FastifyRequest): Promise<void> {
  const token = getSessionTokenFromCookie(req.headers.cookie);
  if (!token) return Promise.resolve();
  return findSessionByToken(token).then(async (found) => {
    if (found) {
      const { deleteSession } = await import('@dockdo/shared');
      await deleteSession(found.session.id);
    }
  });
}

export function csrfCookieName(server: 'app' | 'admin'): string {
  return server === 'app' ? 'dockdo_csrf' : 'dockdo_admin_csrf';
}