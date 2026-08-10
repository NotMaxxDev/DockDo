import * as crypto from 'crypto';
import { eq, gt, lt } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sessions, users, type User } from '../db-schema';
import { getDb, getHandle } from '../db-client';
import { nowIso, sha256hex, uuid } from '../config';

export const SESSION_COOKIE = 'dockdo_sid';
export const APP_CSRF_COOKIE = 'dockdo_csrf';
export const ADMIN_CSRF_COOKIE = 'dockdo_admin_csrf';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(
  userId: string,
  ip: string | undefined,
  userAgent: string | undefined,
  ttlDays: number
): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  await getDb().insert(sessions).values({
    id: uuid(),
    userId,
    tokenHash: sha256hex(token),
    ip: ip || null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
    expiresAt,
    lastSeenAt: nowIso(),
    createdAt: nowIso()
  });
  return { token, expiresAt };
}

export async function findSessionByToken(token: string): Promise<{ session: typeof sessions.$inferSelect; user: User } | null> {
  if (!token) return null;
  const session = await getDb().select().from(sessions).where(eq(sessions.tokenHash, sha256hex(token))).limit(1).then((r) => r[0]);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await getDb().delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  const user = await getDb().select().from(users).where(eq(users.id, session.userId)).limit(1).then((r) => r[0]);
  if (!user || user.status !== 'active') return null;
  return { session, user };
}

export async function touchSession(sessionId: string): Promise<void> {
  try {
    getDb()
      .update(sessions)
      .set({ lastSeenAt: nowIso() })
      .where(eq(sessions.id, sessionId))
      .run();
  } catch {
    /* ignore */
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const all = await (getDb() as BetterSQLite3Database<typeof import('../db-schema')>)
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId));
  for (const s of all) {
    if (s.id !== exceptSessionId) await deleteSession(s.id);
  }
}

export async function cleanupExpiredSessions(): Promise<void> {
  (getDb() as BetterSQLite3Database<typeof import('../db-schema')>)
    .delete(sessions)
    .where(lt(sessions.expiresAt, nowIso()))
    .run();
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function getSessionTokenFromCookie(header: string | undefined): string | undefined {
  return parseCookies(header)[SESSION_COOKIE];
}

export function cookieOptions(cfg: { publicUrl: string; cookieSecret: string }, maxAgeMs: number) {
  const isHttps = cfg.publicUrl.startsWith('https://');
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs
  };
}

export function csrfToken(userId: string): string {
  return crypto
    .createHmac('sha256', getHandle().config.cookieSecret)
    .update(`csrf:${userId}:${new Date().toDateString()}`)
    .digest('hex');
}

export function verifyCsrf(cookie: string | undefined, token: string | undefined, userId: string): boolean {
  if (!cookie || !token) return false;
  const expected = csrfToken(userId);
  const a = Buffer.from(cookie);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && cookie === expected;
}

export function signPayload(payload: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const body = Buffer.from(JSON.stringify({ p: payload, e: exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getHandle().config.cookieSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPayload(token: string): unknown | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const sig = crypto.createHmac('sha256', getHandle().config.cookieSecret).update(parts[0]).digest('base64url');
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    if (data.e < Date.now()) return null;
    return data.p;
  } catch {
    return null;
  }
}

export function hasExpired(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

export const cleanupStale = async (): Promise<void> => {
  try {
    (getDb() as BetterSQLite3Database<typeof import('../db-schema')>)
      .delete(sessions)
      .where(lt(sessions.expiresAt, nowIso()))
      .run();
  } catch {
    /* ignore */
  }
};