import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useStore } from '../store';

export function LoginPage() {
  const { meta, login, completeTotp } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await login(email, password);
      if (res.needTotp) {
        setTotpToken(res.totpToken || null);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!totpToken) throw new Error('Sitzung abgelaufen, bitte erneut anmelden.');
      await completeTotp(totpToken, totp);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const canLocal = meta ? meta.authMode !== 'oidc' : false;
  const oidcProviders = meta?.oidcProviders || [];
  const serverOk = meta !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-8 shadow-[0_8px_40px_rgba(0,0,0,0.35)]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-xl font-black text-white shadow-lg shadow-primary/30">
            D
          </div>
          <h1 className="text-xl font-bold leading-tight">{meta?.appName || 'DockDo'}</h1>
          <p className="mt-1 text-xs text-muted">Deine Aufgaben, immer synchron.</p>
        </div>

        {oidcProviders.length > 0 && (
          <div className="mb-5 space-y-2">
            {oidcProviders.map((p) => (
              <a key={p.id} href={`/api/auth/oidc/${p.id}`} className="btn-ghost w-full">
                Anmelden mit {p.name}
              </a>
            ))}
          </div>
        )}

        {canLocal && !totpToken && (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="label">E-Mail</label>
              <input className="input !px-4 !py-3 !rounded-lg" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input className="input !px-4 !py-3 !rounded-lg" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            <button className="mt-1 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy}>
              {busy ? 'Anmelden…' : 'Anmelden'}
            </button>
          </form>
        )}

        {totpToken && (
          <form onSubmit={submitTotp} className="space-y-5">
            <div>
              <label className="label">Zwei-Faktor-Code</label>
              <input className="input !px-4 !py-3 !rounded-lg" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required inputMode="numeric" autoFocus />
            </div>
            {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            <button className="mt-1 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy}>
              Bestätigen
            </button>
          </form>
        )}

        {!serverOk && (
          <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">
            Der Server ist gerade nicht erreichbar.
            <button className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-theme bg-danger/15 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/25" onClick={() => window.location.reload()}>
              <RefreshCw size={12} />
              Erneut versuchen
            </button>
          </div>
        )}

        {serverOk && oidcProviders.length === 0 && !canLocal && (
          <div className="rounded-theme bg-warning/10 px-3 py-2 text-sm text-warning">
            Keine Anmeldemethode konfiguriert. Bitte kontaktiere deinen Administrator.
          </div>
        )}
      </div>
    </div>
  );
}