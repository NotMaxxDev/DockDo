import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Database, FileStack, Loader2, Ship } from 'lucide-react';
import { api } from '../api';

const STEPS = [
  { key: 1, label: 'Konto' },
  { key: 2, label: 'Datenbank' },
  { key: 3, label: 'Fertig' }
];

const NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")";

function Wave() {
  return (
    <svg viewBox="0 0 600 48" preserveAspectRatio="none" className="h-full w-1/2">
      <path d="M0 24 Q75 6 150 24 T300 24 T450 24 T600 24 V48 H0 Z" fill="currentColor" />
    </svg>
  );
}

function ShipSvg() {
  return (
    <svg viewBox="0 0 140 58" className="h-14 w-auto drop-shadow-lg" aria-hidden>
      <path d="M10 40 L28 24 L72 20 L122 26 L130 38 Q70 46 10 40 Z" fill="#ffffff" opacity="0.96" />
      <path d="M28 24 L72 20 L72 40 L28 40 Z" fill="#e2e8f0" />
      <rect x="36" y="6" width="16" height="14" rx="2" fill="#c7d2fe" />
      <rect x="56" y="2" width="20" height="18" rx="2" fill="#ffffff" />
      <rect x="98" y="2" width="12" height="16" rx="3" fill="#0f172a" />
      <circle cx="104" cy="22" r="3.5" fill="#0f172a" opacity="0.85" />
      <circle cx="66" cy="22" r="2.5" fill="#0f172a" opacity="0.6" />
      <circle cx="58" cy="22" r="2" fill="#0f172a" opacity="0.4" />
    </svg>
  );
}

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
  const [finishing, setFinishing] = useState(false);
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

  const progress = done ? 3 : step;
  const percent = Math.round((progress / STEPS.length) * 100);

  const invalidEmail = (v: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const invalidPw = (v: string) => v.length < 8 || !/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/[0-9]/.test(v);
  const pwChecks = [password.length >= 8, /[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password)];
  const strength = pwChecks.filter(Boolean).length;
  const strengthColor = strength <= 1 ? 'rgb(var(--c-danger))' : strength === 2 ? 'rgb(var(--c-warning))' : 'rgb(var(--c-success))';
  const strengthText = ['Sehr schwach', 'Schwach', 'In Ordnung', 'Stark'][Math.max(0, strength - 1)];

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (invalidEmail(email)) return setError('Bitte eine gültige E-Mail-Adresse angeben.');
    if (invalidPw(password)) return setError('Das Passwort muss mindestens 8 Zeichen enthalten (groß/klein/Ziffer).');
    if (!params.get('skipDb')) setStep(2);
    else {
      setBusy(true);
      setFinishing(true);
      try {
        await api('/api/setup', { method: 'POST', body: { name, email, password } });
        setDone(true);
      } catch (err) {
        setFinishing(false);
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
    setFinishing(true);
    setError('');
    try {
      await api('/api/setup', { method: 'POST', body: { name, email, password } });
      setDone(true);
    } catch (err) {
      setFinishing(false);
      setError(err instanceof Error ? err.message : 'Setup fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const showShimmer = busy || finishing;

  return (
    <div className="flex h-screen bg-bg">
      <aside className="relative hidden w-[46%] shrink-0 overflow-hidden bg-gradient-to-br from-[#3730a3] via-primary to-accent lg:block">
        <div className="absolute inset-0" style={{ backgroundImage: NOISE_URI, backgroundSize: '160px' }} />
        <div className="relative z-10 flex h-full flex-col justify-between p-8 pb-44 lg:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-theme bg-white/15 text-lg font-black text-white backdrop-blur">D</div>
            <span className="text-sm font-bold uppercase tracking-[0.35em] text-white/80">DockDo</span>
          </div>

          <div className="dockdo-rise">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">Deine Installation</p>
            <h1 className="text-3xl font-black leading-tight text-white lg:text-4xl">
              Dein Dock,
              <br />
              klar zur Fahrt.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
              Richte dein DockDo in wenigen Minuten ein — komplett selbst gehostet, deine Daten bleiben im eigenen Hafen.
            </p>
            <div className="mt-7 flex items-center gap-3 text-white/60">
              {STEPS.map((s) => (
                <span key={s.key} className={`h-1.5 w-10 rounded-full transition-colors duration-500 ${progress >= s.key ? 'bg-white' : 'bg-white/25'}`} />
              ))}
              <span className="font-mono text-sm font-bold tabular-nums text-white/80">{percent}%</span>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-40 overflow-hidden">
            <div className="dockdo-wave absolute inset-x-0 bottom-10 h-12 w-[200%] text-white/25">
              <Wave />
              <Wave />
            </div>
            <div className="dockdo-wave-slow absolute inset-x-0 bottom-4 h-10 w-[200%] text-white/15">
              <Wave />
              <Wave />
            </div>
            <div
              className="dockdo-ship absolute bottom-14 transition-all duration-700 ease-out"
              style={{ left: `calc(${percent}% - 44px)` }}
            >
              <ShipSvg />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-theme bg-primary text-lg font-black text-white">D</div>
            <div>
              <h1 className="text-lg font-black leading-tight text-ink">DockDo</h1>
              <p className="text-xs text-muted">Deine Installation einrichten</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-3 flex items-end justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
                Schritt {step} von {STEPS.length}
              </p>
              <p className="font-mono text-sm font-bold tabular-nums text-ink">{percent}%</p>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-line">
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
                style={{ width: `${percent}%` }}
              >
                {showShimmer && <div className="dockdo-shimmer absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-white/50 to-transparent" />}
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] font-semibold">
              {STEPS.map((s) => {
                const isDone = progress > s.key;
                const isCurrent = progress === s.key;
                return (
                  <span key={s.key} className={`flex items-center gap-1.5 ${isDone ? 'text-ok' : isCurrent ? 'text-ink' : 'text-muted/50'}`}>
                    {isDone ? (
                      <Check size={13} strokeWidth={3.5} />
                    ) : (
                      <span className={`h-1.5 w-1.5 rounded-full ${isCurrent ? 'dockdo-pulse-dot bg-primary' : 'bg-line'}`} />
                    )}
                    {s.label}
                  </span>
                );
              })}
            </div>
          </div>

          {done ? (
            <div className="dockdo-rise card p-8 text-center">
              <div className="mx-auto mb-5 h-16 w-16">
                <svg viewBox="0 0 52 52" className="h-full w-full" aria-hidden>
                  <circle cx="26" cy="26" r="24" fill="none" stroke="rgb(var(--c-success))" strokeWidth="3" className="dockdo-check-circle" />
                  <path
                    fill="none"
                    stroke="rgb(var(--c-success))"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 27 l8 8 l15 -16"
                    className="dockdo-check-mark"
                  />
                </svg>
              </div>
              <h1 className="mb-1 text-xl font-black text-ink">Anker los!</h1>
              <p className="mb-6 text-sm text-muted">Dein Admin-Konto ist bereit. Melde dich an und leg los.</p>
              <button className="btn-primary w-full" onClick={() => navigate('/login', { replace: true })}>
                <Ship size={16} />
                Zum Login
              </button>
            </div>
          ) : step === 1 ? (
            <form key={step} onSubmit={submitAccount} className="dockdo-rise space-y-3.5">
              <div>
                <h2 className="text-xl font-black leading-tight text-ink">Wer führt dein Dock?</h2>
                <p className="mt-1 text-sm text-muted">Erstelle das Administrator-Konto — es verwaltet die gesamte Installation.</p>
              </div>
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
                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {pwChecks.map((ok, i) => (
                        <span
                          key={i}
                          className="h-1 flex-1 rounded-full transition-colors duration-300"
                          style={{ background: ok ? strengthColor : 'rgb(var(--c-border))' }}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {strengthText} — mindestens 8 Zeichen mit Groß-, Kleinbuchstaben und Ziffer.
                    </p>
                  </div>
                )}
              </div>
              {nameError && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{nameError}</div>}
              {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
              <button className="btn-primary w-full" type="submit">
                Weiter zur Datenbank
              </button>
            </form>
          ) : (
            <div key={step} className="dockdo-rise space-y-3.5">
              <div>
                <h2 className="text-xl font-black leading-tight text-ink">Wähle die Datenbank</h2>
                <p className="mt-1 text-sm text-muted">Aktueller Modus: <span className="font-mono font-semibold text-ink">{dbMode}</span></p>
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  className={`card relative p-4 text-left transition-all duration-200 ${dbMode === 'sqlite' ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50'}`}
                  onClick={() => void switchDb('sqlite')}
                  disabled={busy}
                >
                  {dbMode === 'sqlite' && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                      <Check size={12} strokeWidth={3.5} />
                    </span>
                  )}
                  <div className="mb-1 flex items-center gap-2 font-semibold text-ink">
                    <FileStack size={16} className={dbMode === 'sqlite' ? 'text-primary' : 'text-muted'} />
                    SQLite (Standard)
                  </div>
                  <p className="text-xs leading-relaxed text-muted">Dateibasiert, Zero-Config — ideal für kleine und mittlere Installationen.</p>
                </button>
                <button
                  type="button"
                  className={`card relative p-4 text-left transition-all duration-200 ${dbMode === 'mariadb' ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50'}`}
                  onClick={() => void switchDb('mariadb')}
                  disabled={busy}
                >
                  {dbMode === 'mariadb' && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                      <Check size={12} strokeWidth={3.5} />
                    </span>
                  )}
                  <div className="mb-1 flex items-center gap-2 font-semibold text-ink">
                    <Database size={16} className={dbMode === 'mariadb' ? 'text-primary' : 'text-muted'} />
                    MariaDB
                  </div>
                  <p className="text-xs leading-relaxed text-muted">Externer Dienst für größere und parallele Lasten. Erforderlich im Compose-Setup: <code className="rounded bg-surface px-1 text-[11px]">docker compose up -d</code></p>
                </button>
              </div>

              {dbTestState === 'testing' && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  Verbindung wird geprüft…
                </div>
              )}
              {dbTestState === 'ok' && !restartHint && (
                <div className="flex items-center gap-2 text-sm text-ok">
                  <Check size={14} strokeWidth={3} />
                  Modus {dbMode} ist einsatzbereit.
                </div>
              )}
              {dbTestState === 'ok' && restartHint && (
                <div className="rounded-theme bg-warn/10 px-3 py-2 text-sm text-warn">
                  Modus gewechselt. Bitte starte die Container neu: <code className="rounded bg-surface px-1">docker compose up -d</code>
                </div>
              )}
              {dbTestState === 'fail' && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{dbTestMsg}</div>}
              {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

              <button className="btn-primary w-full" onClick={finish} disabled={busy || dbTestState === 'testing'}>
                {busy || finishing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Bitte warten…
                  </>
                ) : (
                  'Setup abschließen'
                )}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
