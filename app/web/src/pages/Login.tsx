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
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4"
      style={{ backgroundImage: "url('/login-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-[#0A0E1A]/75" />
      <div className="relative w-full max-w-[400px] rounded-[20px] border border-white/10 bg-[#0F1420]/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-[10px] sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#6366F1] text-xl font-black text-white">
            D
          </div>
          <h1 className="mt-4 text-2xl font-bold leading-tight text-white">{meta?.appName || 'DockDo'}</h1>
          <p className="mb-8 mt-1 text-sm text-[#8B92A8]">Deine Aufgaben, immer synchron.</p>
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
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.5px] text-[#6B7280]">E-Mail</label>
              <input
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#6366F1]"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="du@beispiel.de"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.5px] text-[#6B7280]">Passwort</label>
              <input
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#6366F1]"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">{error}</div>}
            <button
              className="mt-2 w-full cursor-pointer rounded-[10px] bg-[#6366F1] py-[14px] text-sm font-semibold text-white transition-colors hover:bg-[#5558E3] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
            >
              {busy ? 'Anmelden…' : 'Anmelden'}
            </button>
          </form>
        )}

        {totpToken && (
          <form onSubmit={submitTotp} className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.5px] text-[#6B7280]">Zwei-Faktor-Code</label>
              <input
                className="w-full rounded-[10px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#6366F1]"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                inputMode="numeric"
                autoFocus
              />
            </div>
            {error && <div className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">{error}</div>}
            <button
              className="mt-2 w-full cursor-pointer rounded-[10px] bg-[#6366F1] py-[14px] text-sm font-semibold text-white transition-colors hover:bg-[#5558E3] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
            >
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