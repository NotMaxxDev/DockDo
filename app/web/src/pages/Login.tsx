import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

  const canLocal = meta && meta.authMode !== 'oidc';
  const oidcProviders = meta?.oidcProviders || [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-theme bg-primary text-lg font-bold text-white">D</div>
          <div>
            <h1 className="text-xl font-bold leading-tight">{meta?.appName || 'DockDo'}</h1>
            <p className="text-xs text-muted">Deine Aufgaben, immer synchron.</p>
          </div>
        </div>

        {oidcProviders.length > 0 && (
          <div className="mb-4 space-y-2">
            {oidcProviders.map((p) => (
              <a key={p.id} href={`/api/auth/oidc/${p.id}`} className="btn-ghost w-full">
                Anmelden mit {p.name}
              </a>
            ))}
          </div>
        )}

        {canLocal && !totpToken && (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">E-Mail</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Anmelden…' : 'Anmelden'}</button>
          </form>
        )}

        {totpToken && (
          <form onSubmit={submitTotp} className="space-y-3">
            <div>
              <label className="label">Zwei-Faktor-Code</label>
              <input className="input" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required inputMode="numeric" autoFocus />
            </div>
            {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            <button className="btn-primary w-full" disabled={busy}>Bestätigen</button>
          </form>
        )}

        {!canLocal && oidcProviders.length === 0 && (
          <div className="rounded-theme bg-warning/10 px-3 py-2 text-sm text-warning">Keine Anmeldemethode konfiguriert. Bitte kontaktiere deinen Administrator.</div>
        )}
      </div>
    </div>
  );
}