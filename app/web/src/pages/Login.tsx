import React, { useEffect, useState } from 'react';
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
  const [bg, setBg] = useState<string | null>(null);
  useEffect(() => {
    const url = `https://picsum.photos/1280/720?random=${Date.now()}`;
    const img = new Image();
    img.onload = () => setBg(url);
    img.src = url;
    return () => { img.onload = null; };
  }, []);

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
    <div
      className="login-wrapper"
      style={bg ? ({ ['--login-bg' as string]: `url('${bg}')` } as React.CSSProperties) : undefined}
    >
      <div className="login-overlay" />
      <div className="login-card">
        <img src="/icon.svg" alt="" className="login-logo" />
        <h1 className="login-title">{meta?.appName || 'DockDo'}</h1>

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
          <form onSubmit={submit}>
            <div className="login-group">
              <label className="login-label" htmlFor="login-email">E-Mail</label>
              <input
                className="login-input"
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="du@beispiel.de"
              />
            </div>
            <div className="login-group">
              <label className="login-label" htmlFor="login-password">Passwort</label>
              <input
                className="login-input"
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" disabled={busy}>
              {busy ? 'Anmelden…' : 'Anmelden'}
            </button>
          </form>
        )}

        {totpToken && (
          <form onSubmit={submitTotp}>
            <div className="login-group">
              <label className="login-label" htmlFor="login-totp">Zwei-Faktor-Code</label>
              <input
                className="login-input"
                id="login-totp"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                inputMode="numeric"
                autoFocus
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" disabled={busy}>
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