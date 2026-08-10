import { Issuer } from 'openid-client';
import type { OidcProviderConfig } from '@dockdo/shared';

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