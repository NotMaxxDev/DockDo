import type { FastifyInstance } from 'fastify';
import {
  getAuthSettings, saveAuthSettings, getGeneralSettings, audit, publishSyncEvent,
  uuid, setSetting,
  type AuthSettings, type OidcProviderConfig
} from '@dockdo/shared';
import { requireAdmin } from '../gateway';
import { testOidcConnection } from '../oidc';

export function registerAdminAuthConfigRoutes(app: FastifyInstance): void {
  app.get('/api/admin/auth-config', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const auth = await getAuthSettings();
    return {
      ...auth,
      oidcProviders: auth.oidcProviders.map((p) => ({ ...p, clientSecret: p.clientSecret ? '••••••••' : '' }))
    };
  });

  app.put('/api/admin/auth-config', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as Partial<AuthSettings>;
    const auth = await getAuthSettings();
    if (body.mode && ['local', 'oidc', 'both'].includes(body.mode)) auth.mode = body.mode;
    if (body.local && typeof body.local === 'object') {
      auth.local = { ...auth.local, ...body.local };
      auth.local.minPasswordLength = Math.max(6, Math.min(32, Number(auth.local.minPasswordLength) || 8));
      auth.local.lockoutThreshold = Math.max(1, Number(auth.local.lockoutThreshold) || 5);
      auth.local.lockoutMinutes = Math.max(1, Number(auth.local.lockoutMinutes) || 15);
    }
    if (body.sessionTtlDays) auth.sessionTtlDays = Math.max(1, Number(body.sessionTtlDays) || 30);
    if (body.emergencyAdminEmail !== undefined) auth.emergencyAdminEmail = body.emergencyAdminEmail;
    if (Array.isArray(body.oidcProviders)) {
      auth.oidcProviders = body.oidcProviders.map((p) => stripSecret(p, auth));
    }
    await saveAuthSettings(auth);
    await audit(req.user!, 'auth:config-updated', 'system', undefined, { mode: auth.mode }, req.clientIp);
    await publishSyncEvent('system:auth-changed', {});
    return { ok: true };
  });

  app.post('/api/admin/auth-config/test-oidc', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { discoveryUrl?: string; clientId?: string; clientSecret?: string };
    if (!body.discoveryUrl || !body.clientId) return reply.status(400).send({ error: 'Discovery-URL und Client-ID erforderlich.' });
    const result = await testOidcConnection({ discoveryUrl: body.discoveryUrl, clientId: body.clientId, clientSecret: body.clientSecret || '' });
    await audit(req.user!, 'auth:oidc-test', 'system', undefined, { ok: result.ok, issuer: result.issuer, error: result.error }, req.clientIp);
    return result;
  });

  app.post('/api/admin/auth-config/oidc', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as Partial<OidcProviderConfig> & { provider: 'keycloak' | 'authentik' | 'custom' };
    if (!body.name || !body.discoveryUrl || !body.clientId) return reply.status(400).send({ error: 'Name, Discovery-URL und Client-ID erforderlich.' });
    if (body.discoveryUrl && !/^https?:\/\//.test(body.discoveryUrl)) return reply.status(400).send({ error: 'Discovery-URL muss mit http(s):// beginnen.' });
    const auth = await getAuthSettings();
    const id = body.id || uuid();
    const existing = auth.oidcProviders.find((p) => p.id === id);
    const provider: OidcProviderConfig = {
      id,
      name: body.name.trim(),
      provider: body.provider || 'custom',
      enabled: body.enabled ?? (existing?.enabled ?? false),
      discoveryUrl: body.discoveryUrl.trim().replace(/\/$/, ''),
      clientId: body.clientId.trim(),
      clientSecret: body.clientSecret ? body.clientSecret.trim() : (existing?.clientSecret || ''),
      scopes: body.scopes?.length ? body.scopes : ['openid', 'email', 'profile'],
      roleClaimPath: body.roleClaimPath || 'realm_access.roles',
      roleMapping: {
        admin: body.roleMapping?.admin || [],
        moderator: body.roleMapping?.moderator || [],
        user: body.roleMapping?.user || []
      },
      autoProvision: body.autoProvision ?? false
    };
    const idx = auth.oidcProviders.findIndex((p) => p.id === id);
    if (idx >= 0) auth.oidcProviders[idx] = provider;
    else auth.oidcProviders.push(provider);
    if (provider.enabled && auth.mode === 'local') {
      auth.mode = 'both';
    }
    await saveAuthSettings(auth);
    await audit(req.user!, 'auth:oidc-saved', 'system', id, { name: provider.name, provider: provider.provider, enabled: provider.enabled }, req.clientIp);
    return { ok: true, provider };
  });

  app.delete('/api/admin/auth-config/oidc/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const auth = await getAuthSettings();
    auth.oidcProviders = auth.oidcProviders.filter((p) => p.id !== id);
    await saveAuthSettings(auth);
    await audit(req.user!, 'auth:oidc-deleted', 'system', id, {}, req.clientIp);
    return { ok: true };
  });

  app.post('/api/admin/auth-config/vapid', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const webpush = (await import('web-push'));
    const keys = webpush.generateVAPIDKeys();
    const general = await getGeneralSettings();
    general.vapidPublicKey = keys.publicKey;
    general.vapidPrivateKey = keys.privateKey;
    await setSetting('general', general);
    await audit(req.user!, 'auth:vapid-generated', 'system', undefined, {}, req.clientIp);
    return { ok: true, publicKey: keys.publicKey, privateKey: keys.privateKey };
  });
}

function stripSecret(p: OidcProviderConfig, auth: AuthSettings): OidcProviderConfig {
  const existing = auth.oidcProviders.find((x) => x.id === p.id);
  if (p.clientSecret && p.clientSecret === '••••••••' && existing) {
    return { ...p, clientSecret: existing.clientSecret };
  }
  return p;
}