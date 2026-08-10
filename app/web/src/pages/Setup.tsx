import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export function SetupWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dbMode, setDbMode] = useState<'sqlite' | 'mariadb'>('sqlite');
  const [dbTestState, setDbTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [dbTestMsg, setDbTestMsg] = useState('');
  const [restartHint, setRestartHint] = useState(false);
  const [done, setDone] = useState(false);

  React.useEffect(() => {
    void (async () => {
      const res = await fetch('/api/setup/state');
      const state = (await res.json()) as { done: boolean; dbMode: 'sqlite' | 'mariadb' };
      if (state.done) navigate('/login', { replace: true });
      else setDbMode(state.dbMode);
    })();
  }, [navigate]);

  const invalidEmail = (v: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const invalidPw = (v: string) => v.length < 8 || !/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/[0-9]/.test(v);

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (invalidEmail(email)) return setError('Bitte eine gültige E-Mail-Adresse angeben.');
    if (invalidPw(password)) return setError('Das Passwort muss mindestens 8 Zeichen enthalten (groß/klein/Ziffer).');
    if (!params.get('skipDb')) setStep(2);
    else {
      setBusy(true);
      try {
        await api('/api/setup', { method: 'POST', body: { name, email, password } });
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Setup fehlgeschlagen.');
      } finally {
        setBusy(false);
      }
    }
  };

  const switchDb = async (mode: 'sqlite' | 'mariadb') => {
    setBusy(true);
    setDbTestState('testing');
    setDbTestMsg('');
    setError('');
    try {
      const res = await api<{ ok: boolean; restartRequired?: boolean }>('/api/setup/db', { method: 'POST', body: { mode } });
      setDbMode(mode);
      setDbTestState('ok');
      setRestartHint(!!res.restartRequired);
    } catch (err) {
      setDbTestState('fail');
      setDbTestMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/setup', { method: 'POST', body: { name, email, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="card w-full max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-ok">✓</div>
          <h1 className="mb-2 text-xl font-bold">Setup abgeschlossen!</h1>
          <p className="mb-5 text-sm text-muted">Dein Admin-Konto ist bereit. Melde dich jetzt an.</p>
          <button className="btn-primary w-full" onClick={() => navigate('/login')}>Zum Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-line'}`} />
            ))}
          </div>
          <h1 className="text-xl font-bold">Willkommen bei DockDo</h1>
          <p className="text-sm text-muted">Richte deine Installation ein.</p>
        </div>

        {step === 1 && (
          <form onSubmit={submitAccount} className="space-y-3">
            <div>
              <label className="label">Administrator-Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="mt-1 text-xs text-muted">Mindestens 8 Zeichen mit Groß-, Kleinbuchstaben und Ziffer.</p>
            </div>
            {nameError && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{nameError}</div>}
            {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            <button className="btn-primary w-full" type="submit">Weiter</button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="mb-1 font-semibold">Datenbank</h2>
              <p className="text-sm text-muted">Aktueller Modus: <span className="font-mono text-ink">{dbMode}</span></p>
            </div>
            <div className="grid gap-3">
              <button
                className={`card p-4 text-left transition-colors ${dbMode === 'sqlite' ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50'}`}
                onClick={() => void switchDb('sqlite')}
                disabled={busy}
              >
                <div className="font-semibold">SQLite (Standard)</div>
                <p className="text-xs text-muted">Dateibasiert, Zero-Config – ideal für kleine und mittlere Installationen.</p>
              </button>
              <button
                className={`card p-4 text-left transition-colors ${dbMode === 'mariadb' ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50'}`}
                onClick={() => void switchDb('mariadb')}
                disabled={busy}
              >
                <div className="font-semibold">MariaDB</div>
                <p className="text-xs text-muted">Externer Container für größere und parallele Lasten. Erfordert: docker compose --profile mariadb up -d</p>
              </button>
            </div>
            {dbTestState === 'testing' && <div className="text-sm text-muted">Verbindung wird geprüft…</div>}
            {dbTestState === 'ok' && restartHint && (
              <div className="rounded-theme bg-warning/10 px-3 py-2 text-sm text-warning">
                Modus gewechselt. Bitte starte die Container neu: <code className="rounded bg-surface px-1">docker compose --profile mariadb up -d</code> (bzw. ohne Profil bei SQLite).
              </div>
            )}
            {dbTestState === 'fail' && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{dbTestMsg}</div>}
            {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            <button className="btn-primary w-full" onClick={finish} disabled={busy || dbTestState === 'testing'}>
              {busy ? 'Bitte warten…' : 'Setup abschließen'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}