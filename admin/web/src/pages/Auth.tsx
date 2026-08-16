import React, { useEffect, useState } from 'react';
import { KeyRound, Trash2, Plug, Plus, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { api } from '../api';
import { Modal } from './Users';

interface OidcProvider {
  id: string;
  name: string;
  provider: 'keycloak' | 'authentik' | 'custom';
  enabled: boolean;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  roleClaimPath: string;
  roleMapping: { admin: string[]; moderator: string[]; user: string[] };
  autoProvision: boolean;
}

interface AuthConfig {
  mode: 'local' | 'oidc' | 'both';
  local: { minPasswordLength: number; lockoutThreshold: number; lockoutMinutes: number };
  sessionTtlDays: number;
  oidcProviders: OidcProvider[];
  emergencyAdminEmail: string;
}

interface SecurityConfig {
  csrfEnabled: boolean;
}

const KEYCLOAK_STEPS = [
  'Im Keycloak Admin-Console links oben "Create Realm" wählen und einen Realm-Namen vergeben (z. B. "todoapp").',
  'Im Realm zu Clients → Create client navigieren. Eine Client-ID vergeben (z. B. "todoapp-web"), Client-Typ "OpenID Connect".',
  '"Client authentication" auf ON stellen (Confidential Client), da der Server ein Secret verwendet.',
  'Unter "Valid redirect URIs" die Callback-URL eintragen.',
  'Unter "Web origins" die CORS-Origin der App eintragen.',
  'Nach dem Speichern im Tab "Credentials" das Client-Secret kopieren – es wird im Wizard benötigt.',
  '(Optional) Unter "Realm roles" Rollen wie "admin" und "user" anlegen, um sie später auf App-Rollen zu mappen.',
  'Die Discovery-URL folgt dem Muster https://<keycloak-host>/realms/<realm>/.well-known/openid-configuration'
];

const AUTHENTIK_STEPS = [
  'Im Authentik Admin-Interface zu Applications → Providers → Create navigieren, Typ "OAuth2/OpenID Provider" wählen.',
  'Provider konfigurieren: Namen vergeben, "Authorization flow" auf den Standard-Flow setzen, Client-Typ "Confidential".',
  'Unter "Redirect URIs/Origins" die Callback-URL eintragen.',
  'Sicherstellen, dass die Scope-Mappings "openid", "email" und "profile" zugewiesen sind.',
  'Client-ID und Client-Secret nach dem Speichern kopieren.',
  'Unter Applications → Create eine neue Application anlegen und mit dem Provider verknüpfen.',
  '(Optional) Über "Policy/Group/User Bindings" festlegen, welche Gruppen Zugriff erhalten.',
  'Die Discovery-URL folgt dem Muster https://<authentik-host>/application/o/<application-slug>/.well-known/openid-configuration'
];

export function AuthPage() {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [security, setSecurity] = useState<SecurityConfig | null>(null);
  const [wizard, setWizard] = useState<null | { provider: 'keycloak' | 'authentik'; edit?: OidcProvider }>(null);
  const [vapid, setVapid] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    const d = await api<AuthConfig>('/api/admin/auth-config');
    setCfg(d);
  };

  useEffect(() => {
    void load();
    void api<SecurityConfig>('/api/admin/settings/security').then(setSecurity).catch(() => undefined);
  }, []);

  const save = async (patch: Partial<AuthConfig>) => {
    await api('/api/admin/auth-config', { method: 'PUT', body: patch });
    await load();
  };

  const generateVapid = async () => {
    const res = await api<{ publicKey: string; privateKey: string }>('/api/admin/auth-config/vapid', { method: 'POST' });
    setVapid(`${res.publicKey}\n${res.privateKey}`);
  };

  if (!cfg) return <div className="text-muted">Lade…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Authentifizierung</h1>
        <p className="text-sm text-muted">Lokale Auth, OIDC-Provider (Keycloak/Authentik) und Sicherheitseinstellungen</p>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Anmeldemodus</h2>
        <div className="flex flex-wrap gap-2">
          {([['local', 'Nur lokal'], ['oidc', 'Nur OIDC'], ['both', 'Beides parallel']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => void save({ mode })}
              className={`card px-4 py-2.5 text-sm font-medium ${cfg.mode === mode ? 'border-primary ring-2 ring-primary/30 text-primary' : 'text-muted hover:border-primary/50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Tipp: Ein OIDC-Provider aktiviert den Modus automatisch auf „Beides“. Bei Ausfall des IdP bleibt der lokale Notfall-Admin-Zugang erhalten.</p>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">OIDC-Provider</h2>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={() => setWizard({ provider: 'keycloak' })}><Plug className="h-3.5 w-3.5" /> Keycloak-Wizard</button>
            <button className="btn-ghost text-xs" onClick={() => setWizard({ provider: 'authentik' })}><Plug className="h-3.5 w-3.5" /> Authentik-Wizard</button>
          </div>
        </div>
        {cfg.oidcProviders.length === 0 && <div className="text-sm text-muted">Keine OIDC-Provider konfiguriert.</div>}
        <div className="space-y-3">
          {cfg.oidcProviders.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-theme bg-bg p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {p.name}
                  <span className={`chip ${p.enabled ? 'bg-ok/10 text-ok' : 'bg-line text-muted'}`}>{p.enabled ? 'Aktiv' : 'Inaktiv'}</span>
                </div>
                <div className="truncate text-xs text-muted">{p.discoveryUrl}</div>
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="h-4 w-4" checked={p.enabled} onChange={async (e) => {
                  await api('/api/admin/auth-config/oidc', { method: 'POST', body: { ...p, enabled: e.target.checked } });
                  await load();
                }} />
                Aktiv
              </label>
              <button className="btn-quiet px-2 py-1 text-xs" onClick={() => setWizard({ provider: 'keycloak', edit: p })}>Bearbeiten</button>
              <button className="btn-quiet px-2 py-1 text-xs !text-danger" onClick={() => { if (confirm('Provider entfernen?')) void api(`/api/admin/auth-config/oidc/${p.id}`, { method: 'DELETE' }).then(load); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Lokale Auth-Sicherheit</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Min. Passwortlänge</label>
              <input type="number" className="input" value={cfg.local.minPasswordLength} onChange={(e) => void save({ local: { ...cfg.local, minPasswordLength: Number(e.target.value) } })} min={6} max={32} />
            </div>
            <div>
              <label className="label">Lockout-Schwelle</label>
              <input type="number" className="input" value={cfg.local.lockoutThreshold} onChange={(e) => void save({ local: { ...cfg.local, lockoutThreshold: Number(e.target.value) } })} min={1} />
            </div>
            <div>
              <label className="label">Sperrdauer (min)</label>
              <input type="number" className="input" value={cfg.local.lockoutMinutes} onChange={(e) => void save({ local: { ...cfg.local, lockoutMinutes: Number(e.target.value) } })} min={1} />
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Session-Lebensdauer (Tage)</label>
            <input type="number" className="input" value={cfg.sessionTtlDays} onChange={(e) => void save({ sessionTtlDays: Number(e.target.value) })} min={1} />
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={security?.csrfEnabled ?? true}
                disabled={!security}
                onChange={async (e) => {
                  const res = await api<{ security: SecurityConfig }>('/api/admin/settings/security', {
                    method: 'PUT',
                    body: { csrfEnabled: e.target.checked }
                  });
                  setSecurity(res.security);
                }}
              />
              <span>
                <span className="font-medium">CSRF-Schutz aktiviert</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Schützt vor Cross-Site-Request-Forgery-Angriffen. Nur deaktivieren, wenn externe Integrationen (z. B. eigene Clients)
                  die X-CSRF-Token-Prüfung nicht erfüllen können – das schwächt die Sicherheit erheblich.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Web-Push (VAPID-Schlüssel)</h2>
            <button className="btn-ghost text-xs" onClick={() => void generateVapid()}>Schlüssel generieren</button>
          </div>
          <p className="mb-2 text-xs text-muted">Wird für Browser-Push-Benachrichtigungen benötigt. Schlüssel einmalig generieren – danach im Allgemeinen-Bereich der Einstellungen verwaltet.</p>
          {vapid && <pre className="max-h-32 overflow-auto rounded-theme bg-bg p-3 text-[10px]">{vapid}</pre>}
        </div>
      </div>

      {msg && <div className="text-sm text-muted">{msg}</div>}

      {wizard && (
        <OidcWizard
          provider={wizard.provider}
          edit={wizard.edit}
          appUrl={window.location.origin === 'http://localhost:5174' ? 'http://localhost:3000' : window.location.origin.split(':').slice(0, -1).join(':') + ':3000'}
          onClose={() => setWizard(null)}
          onSaved={async () => {
            setWizard(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function OidcWizard({ provider, edit, appUrl, onClose, onSaved }: {
  provider: 'keycloak' | 'authentik';
  edit?: OidcProvider;
  appUrl: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(edit?.name || (provider === 'keycloak' ? 'Keycloak' : 'Authentik'));
  const [discoveryUrl, setDiscoveryUrl] = useState(edit?.discoveryUrl || '');
  const [clientId, setClientId] = useState(edit?.clientId || '');
  const [clientSecret, setClientSecret] = useState(edit?.clientSecret || '');
  const [roleClaimPath, setRoleClaimPath] = useState(edit?.roleClaimPath || 'realm_access.roles');
  const [rolesAdmin, setRolesAdmin] = useState(edit?.roleMapping.admin.join(', ') || '');
  const [rolesModerator, setRolesModerator] = useState(edit?.roleMapping.moderator.join(', ') || '');
  const [rolesUser, setRolesUser] = useState(edit?.roleMapping.user.join(', ') || '');
  const [autoProvision, setAutoProvision] = useState(edit?.autoProvision ?? false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; issuer?: string; error?: string; jwksCount?: number }>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const steps = provider === 'keycloak' ? KEYCLOAK_STEPS : AUTHENTIK_STEPS;
  const callbackUrl = `${appUrl}/api/auth/oidc/${edit?.id || 'todoapp'}/callback`;

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api<{ ok: boolean; issuer?: string; error?: string; jwksCount?: number }>('/api/admin/auth-config/test-oidc', {
        method: 'POST',
        body: { discoveryUrl, clientId, clientSecret }
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/auth-config/oidc', {
        method: 'POST',
        body: {
          id: edit?.id,
          name,
          provider,
          discoveryUrl,
          clientId,
          clientSecret,
          roleClaimPath,
          roleMapping: {
            admin: rolesAdmin.split(',').map((s) => s.trim()).filter(Boolean),
            moderator: rolesModerator.split(',').map((s) => s.trim()).filter(Boolean),
            user: rolesUser.split(',').map((s) => s.trim()).filter(Boolean)
          },
          autoProvision,
          enabled: true
        }
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${provider === 'keycloak' ? 'Keycloak' : 'Authentik'} – Setup-Wizard`} onClose={onClose}>
      {step === 0 && (
        <div className="space-y-3">
          <div className="rounded-theme bg-accent/10 p-3 text-xs leading-relaxed text-accent">
            Bitte konfiguriere zuerst den Provider. Die Callback-URL (Schritt 4 bzw. 3) lautet:
            <code className="mt-1 block break-all rounded bg-surface p-1.5 font-mono">{callbackUrl}</code>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-3 rounded-theme bg-bg p-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
                <span className="leading-relaxed">{s}</span>
              </div>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={() => setStep(1)}>Fertig – Parameter eintragen</button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="label">Name (Anzeigename)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Discovery-URL</label>
            <input className="input font-mono text-xs" value={discoveryUrl} onChange={(e) => setDiscoveryUrl(e.target.value)} placeholder="https://…/.well-known/openid-configuration" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client-ID</label>
              <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
            <div>
              <label className="label">Client-Secret</label>
              <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={edit?.clientSecret === '••••••••' ? '••••••••' : ''} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={() => void test()} disabled={testing || !discoveryUrl}>
              {testing ? 'Prüfe…' : 'Test Connection'}
            </button>
            {testResult && (
              <div className={`flex items-center gap-2 text-xs ${testResult.ok ? 'text-ok' : 'text-danger'}`}>
                {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <span className="max-w-64 truncate">{testResult.ok ? `Verbindung OK (${testResult.issuer}, ${testResult.jwksCount} JWK)` : testResult.error}</span>
              </div>
            )}
          </div>
          <button className="btn-primary w-full" onClick={() => setStep(2)}>Weiter: Rollen-Mapping</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div>
            <label className="label">Claim-Pfad für Rollen/Gruppen <HelpCircle className="inline h-3 w-3" /></label>
            <input className="input font-mono text-xs" value={roleClaimPath} onChange={(e) => setRoleClaimPath(e.target.value)} />
            <p className="mt-1 text-xs text-muted">z. B. <code>realm_access.roles</code> (Keycloak) oder <code>groups</code> (Authentik)</p>
          </div>
          <div>
            <label className="label">Admin-Rollen (kommagetrennt)</label>
            <input className="input" value={rolesAdmin} onChange={(e) => setRolesAdmin(e.target.value)} />
          </div>
          <div>
            <label className="label">Moderator-Rollen (kommagetrennt)</label>
            <input className="input" value={rolesModerator} onChange={(e) => setRolesModerator(e.target.value)} />
          </div>
          <div>
            <label className="label">User-Rollen (kommagetrennt)</label>
            <input className="input" value={rolesUser} onChange={(e) => setRolesUser(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={autoProvision} onChange={(e) => setAutoProvision(e.target.checked)} />
            Konten automatisch provisionieren (unbekannte E-Mails werden angelegt)
          </label>
          {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>Zurück</button>
            <button className="btn-primary flex-1" onClick={() => void save()} disabled={busy || !discoveryUrl || !clientId}>
              {busy ? 'Speichern…' : 'Speichern & aktivieren'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}