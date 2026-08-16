import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import {
  getDb, users, sessions, invites, hashPassword, verifyPassword,
  createSession, deleteSession, deleteUserSessions, cookieOptions, csrfToken,
  getAuthSettings, getGeneralSettings, audit, logLoginAttempt, setSetting,
  nowIso, uuid, signPayload, verifyPayload, validatePasswordStrength, hasExpired,
  sha256hex, createDefaultThemeIfMissing, verifyTotp, logAppEvent,
  type AuthSettings, type OidcProviderConfig, type NewUser
} from '@dockdo/shared';

const APP_CSRF = 'dockdo_csrf';

function setAuthCookies(reply: any, token: string, user: { id: string }, cfg: { publicUrl: string; cookieSecret: string }, ttlDays: number) {
  const opts = cookieOptions(cfg, ttlDays * 24 * 60 * 60 * 1000);
  reply.setCookie('dockdo_sid', token, opts);
  reply.setCookie(APP_CSRF, csrfToken(user.id), { ...opts, httpOnly: false });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const cfg = { publicUrl: app.config.publicAppUrl, cookieSecret: app.config.cookieSecret };

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = await getAuthSettings();
    if (auth.mode === 'oidc') return reply.status(403).send({ error: 'Lokale Anmeldung ist deaktiviert. Bitte OIDC verwenden.' });
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return reply.status(400).send({ error: 'E-Mail und Passwort erforderlich.' });
    const user = await getDb().select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1).then((r) => r[0]);

    const lockout = auth.local.lockoutThreshold;
    const locked = user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now();
    if (locked) {
      await logLoginAttempt(email, req.clientIp, false);
      return reply.status(429).send({ error: 'Konto vorübergehend gesperrt. Bitte später erneut versuchen.' });
    }

    const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false;
    await logLoginAttempt(email, req.clientIp, ok);

    if (!ok || !user) {
      if (user) {
        const fails = (user.failedAttempts || 0) + 1;
        const update: Record<string, unknown> = { failedAttempts: fails, updatedAt: nowIso() };
        if (fails >= lockout) {
          update.lockedUntil = new Date(Date.now() + auth.local.lockoutMinutes * 60 * 1000).toISOString();
          update.failedAttempts = 0;
        }
        await getDb().update(users).set(update).where(eq(users.id, user.id));
      }
      return reply.status(401).send({ error: 'E-Mail oder Passwort ist falsch.' });
    }
    if (user.status === 'suspended') return reply.status(403).send({ error: 'Konto ist gesperrt.' });
    if (user.totpEnabled) {
      const totpToken = signPayload(JSON.stringify({ uid: user.id, step: 'totp' }), 5 * 60 * 1000);
      return reply.send({ needTotp: true, totpToken });
    }
    await getDb().update(users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: nowIso(), updatedAt: nowIso() }).where(eq(users.id, user.id));
    const { token } = await createSession(user.id, req.clientIp, req.headers['user-agent'], auth.sessionTtlDays || 30);
    setAuthCookies(reply, token, user, cfg, auth.sessionTtlDays || 30);
    await audit(user, 'auth:login', 'user', user.id, { method: 'local' }, req.clientIp);
    return { ok: true, user: publicUser(user) };
  });

  app.post('/api/auth/totp', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { totpToken, code } = req.body as { totpToken?: string; code?: string };
    const data = verifyPayload(totpToken || '') as { uid?: string; step?: string } | null;
    if (!data || data.step !== 'totp' || !data.uid) return reply.status(400).send({ error: 'Ungültiges TOTP-Ticket.' });
    const user = await getDb().select().from(users).where(eq(users.id, data.uid)).limit(1).then((r) => r[0]);
    if (!user || !user.totpSecret) return reply.status(400).send({ error: 'TOTP nicht eingerichtet.' });
    const { verifyTotp } = await import('@dockdo/shared');
    if (!verifyTotp(user.totpSecret, code || '')) return reply.status(401).send({ error: 'Code ungültig.' });
    const auth = await getAuthSettings();
    await getDb().update(users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: nowIso(), updatedAt: nowIso() }).where(eq(users.id, user.id));
    const { token } = await createSession(user.id, req.clientIp, req.headers['user-agent'], auth.sessionTtlDays || 30);
    setAuthCookies(reply, token, user, cfg, auth.sessionTtlDays || 30);
    await audit(user, 'auth:login', 'user', user.id, { method: 'local+totp' }, req.clientIp);
    return { ok: true, user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionId) await deleteSession(req.sessionId);
    const opts = cookieOptions(cfg, 0);
    reply.clearCookie('dockdo_sid', { path: '/', secure: opts.secure, sameSite: 'lax' });
    reply.clearCookie(APP_CSRF, { path: '/', secure: opts.secure, sameSite: 'lax' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const csrf = csrfToken(req.user.id);
    reply.setCookie(APP_CSRF, csrf, { ...cookieOptions(cfg, 86400), httpOnly: false });
    const userSessions = await getDb().select().from(sessions).where(eq(sessions.userId, req.user.id)).orderBy(sessions.createdAt);
    const auth = await getAuthSettings();
    const general = await getGeneralSettings();
    return {
      user: publicUser(req.user),
      sessions: userSessions.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt, createdAt: s.createdAt, current: s.id === req.sessionId })),
      csrf,
      authMode: auth.mode,
      general: { appName: general.appName }
    };
  });

  app.post('/api/auth/register', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { token, name, password } = req.body as { token?: string; name?: string; password?: string };
    if (!token || !name || !password) return reply.status(400).send({ error: 'Unvollständige Daten.' });
    const invite = await getDb().select().from(invites).where(eq(invites.tokenHash, sha256hex(token))).limit(1).then((r) => r[0]);
    if (!invite || invite.usedAt) return reply.status(400).send({ error: 'Einladung ist ungültig oder wurde bereits verwendet.' });
    if (hasExpired(invite.expiresAt)) return reply.status(400).send({ error: 'Einladung ist abgelaufen.' });
    const auth = await getAuthSettings();
    const errors = validatePasswordStrength(password, auth.local.minPasswordLength);
    if (errors.length) return reply.status(400).send({ error: errors.join(' ') });
    const existing = await getDb().select().from(users).where(eq(users.email, invite.email)).limit(1).then((r) => r[0]);
    if (existing) return reply.status(400).send({ error: 'Für diese E-Mail existiert bereits ein Konto.' });
    await createDefaultThemeIfMissing();
    const userRow: NewUser = {
      id: uuid(),
      email: invite.email.toLowerCase().trim(),
      name,
      passwordHash: await hashPassword(password),
      role: invite.role as 'admin' | 'moderator' | 'user',
      status: 'active',
      locale: 'de',
      timezone: 'UTC',
      themeId: null,
      notif: {},
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await getDb().insert(users).values(userRow);
    await getDb().update(invites).set({ usedAt: nowIso() }).where(eq(invites.id, invite.id));
    const { token: sid } = await createSession(userRow.id, req.clientIp, req.headers['user-agent'], auth.sessionTtlDays || 30);
    setAuthCookies(reply, sid, { id: userRow.id }, cfg, auth.sessionTtlDays || 30);
    await audit(null, 'auth:register-invite', 'user', userRow.id, { email: userRow.email });
    return { ok: true, user: publicUser(userRow) };
  });

  app.get('/api/auth/oidc/:providerId', async (req, reply) => {
    const auth = await getAuthSettings();
    const { providerId } = req.params as { providerId: string };
    const provider = auth.oidcProviders.find((p) => p.id === providerId && p.enabled);
    if (!provider) return reply.status(404).send({ error: 'Provider nicht gefunden.' });
    const { buildOidcClient } = await import('../oidc');
    try {
      const client = await buildOidcClient(provider, oidcCallbackUrl(app, provider));
      const redirectUrl = await client.authorizationUrl({ scope: (provider.scopes || ['openid', 'email', 'profile']).join(' '), redirect_uri: oidcCallbackUrl(app, provider) });
      return reply.redirect(redirectUrl);
    } catch (err) {
      await import('@dockdo/shared').then((s) => s.logAppEvent('error', 'oidc', 'OIDC start failed', { provider: provider.id, error: String(err) }));
      return reply.status(500).send({ error: 'OIDC-Start fehlgeschlagen: ' + String(err) });
    }
  });

  app.get('/api/auth/oidc/:providerId/callback', async (req, reply) => {
    const auth = await getAuthSettings();
    const { providerId } = req.params as { providerId: string };
    const provider = auth.oidcProviders.find((p) => p.id === providerId && p.enabled);
    if (!provider) return reply.status(404).send({ error: 'Provider nicht gefunden.' });
    const { buildOidcClient, extractRoles, mapRole } = await import('../oidc');
    try {
      const client = await buildOidcClient(provider, oidcCallbackUrl(app, provider));
      const params = client.callbackParams(req.raw.url || '');
      const tokenSet = await client.callback(oidcCallbackUrl(app, provider), params, { state: params.state });
      const claims = tokenSet.claims() as Record<string, unknown>;
      const email = String(claims.email || claims.preferred_username || '').toLowerCase().trim();
      const sub = String(claims.sub || '');
      if (!email) return reply.status(400).send({ error: 'Der Provider liefert keine E-Mail-Adresse.' });
      let user = await getDb().select().from(users).where(eq(users.oidcSubject, sub)).limit(1).then((r) => r[0]);
      if (!user) user = await getDb().select().from(users).where(eq(users.email, email)).limit(1).then((r) => r[0]);
      if (!user) {
        if (!provider.autoProvision) {
          return reply.status(403).send({ error: 'Kein Konto vorhanden. Bitte einen Administrator um Zugang bitten.' });
        }
        const themeId = null;
        const roles = extractRoles(claims, provider.roleClaimPath);
        const mapped = mapRole(roles, provider.roleMapping);
        user = {
          id: uuid(), email, name: String(claims.name || claims.preferred_username || email),
          passwordHash: null, role: mapped, status: 'active', locale: 'de', timezone: 'UTC',
          themeId: null, notif: {}, oidcSubject: sub, oidcProvider: provider.id,
          totpSecret: null, totpEnabled: false, failedAttempts: 0, lockedUntil: null,
          createdAt: nowIso(), updatedAt: nowIso(), lastLoginAt: null
        };
        await getDb().insert(users).values(user);
        await audit(null, 'auth:oidc-provisioned', 'user', user.id, { email, provider: provider.id });
      }
      if (user.status === 'suspended') return reply.status(403).send({ error: 'Konto ist gesperrt.' });
      if (user.status === 'invited') {
        const roles = extractRoles(claims, provider.roleClaimPath);
        const mapped = mapRole(roles, provider.roleMapping);
        const update: Partial<typeof user> = { status: 'active', oidcSubject: sub, oidcProvider: provider.id, lastLoginAt: nowIso(), updatedAt: nowIso() };
        if (mapped !== 'user') update.role = mapped;
        await getDb().update(users).set(update as Record<string, unknown>).where(eq(users.id, user.id));
        user = { ...user, ...update } as typeof user;
      } else {
        await getDb().update(users).set({ lastLoginAt: nowIso(), updatedAt: nowIso() }).where(eq(users.id, user.id));
      }
      const { token } = await createSession(user.id, req.clientIp, req.headers['user-agent'], auth.sessionTtlDays || 30);
      setAuthCookies(reply, token, user, cfg, auth.sessionTtlDays || 30);
      await audit(user, 'auth:login', 'user', user.id, { method: 'oidc', provider: provider.id }, req.clientIp);
      return reply.redirect(app.config.publicAppUrl + '/');
    } catch (err) {
      await import('@dockdo/shared').then((s) => s.logAppEvent('error', 'oidc', 'OIDC callback failed', { provider: provider.id, error: String(err) }));
      return reply.status(500).send({ error: 'OIDC-Anmeldung fehlgeschlagen: ' + String(err) });
    }
  });
}

function oidcCallbackUrl(app: FastifyInstance, provider: OidcProviderConfig): string {
  return `${app.config.publicAppUrl}/api/auth/oidc/${provider.id}/callback`;
}

function publicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    locale: user.locale,
    timezone: user.timezone,
    themeId: user.themeId,
    notif: user.notif || {},
    oidcProvider: user.oidcProvider,
    oidcSubject: !!user.oidcSubject,
    totpEnabled: !!user.totpEnabled,
    createdAt: user.createdAt
  };
}

export { publicUser, oidcCallbackUrl };