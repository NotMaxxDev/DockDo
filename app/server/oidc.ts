import { Issuer, generators, type Client } from 'openid-client';
import type { OidcProviderConfig } from '@dockdo/shared';

const clientCache = new Map<string, { client: Client; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000;

export async function buildOidcClient(provider: OidcProviderConfig, callbackUrl: string): Promise<Client> {
  const cached = clientCache.get(provider.id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.client;
  const issuer = await Issuer.discover(provider.discoveryUrl);
  const client = new issuer.Client({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uris: [callbackUrl]
  });
  clientCache.set(provider.id, { client, fetchedAt: Date.now() });
  return client;
}

export async function testOidcConnection(provider: Pick<OidcProviderConfig, 'discoveryUrl' | 'clientId' | 'clientSecret'>): Promise<{ ok: boolean; issuer?: string; error?: string; endpoints?: { authorization: string; token: string; jwks: string }; jwksCount?: number }> {
  try {
    const issuer = await Issuer.discover(provider.discoveryUrl);
    const client = new issuer.Client({ client_id: provider.clientId, client_secret: provider.clientSecret });
    const jwks = await (issuer as never as { keystore: () => Promise<{ all: () => unknown[] }> }).keystore();
    return {
      ok: true,
      issuer: String(issuer.issuer || ''),
      endpoints: {
        authorization: issuer.metadata.authorization_endpoint || '',
        token: issuer.metadata.token_endpoint || '',
        jwks: issuer.metadata.jwks_uri || ''
      },
      jwksCount: jwks.all().length
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function extractRoles(claims: Record<string, unknown>, claimPath: string): string[] {
  if (!claimPath) return [];
  const parts = claimPath.split('.').filter(Boolean);
  let cur: unknown = claims;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return [];
    }
  }
  if (Array.isArray(cur)) return cur.map(String);
  if (typeof cur === 'string') return cur.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

export function mapRole(roles: string[], mapping: OidcProviderConfig['roleMapping']): 'admin' | 'moderator' | 'user' {
  if (mapping) {
    if (roles.some((r) => (mapping.admin || []).includes(r))) return 'admin';
    if (roles.some((r) => (mapping.moderator || []).includes(r))) return 'moderator';
  }
  return 'user';
}

export function createOidcState(): string {
  return generators.state();
}