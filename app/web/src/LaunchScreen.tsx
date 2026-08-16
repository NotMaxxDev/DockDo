import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface LaunchScreenProps {
  state: 'loading' | 'error';
  message?: string;
  detail?: string;
  onRetry?: () => void;
  progress?: number | null;
  remaining?: number | null;
  status?: string;
}

function Stars() {
  const stars = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: (i * 71 + 13) % 100,
        top: (i * 43 + 7) % 70,
        size: 1 + ((i * 37) % 3),
        delay: (i * 0.37) % 3,
        duration: 2.4 + ((i * 53) % 30) / 10
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {stars.map((s) => (
        <span
          key={s.id}
          className="dockdo-star absolute rounded-full bg-sky-300"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`
          }}
        />
      ))}
    </div>
  );
}

export function LaunchScreen({ state, message, detail, onRetry, progress, remaining, status }: LaunchScreenProps) {
  const loading = state === 'loading';
  const checking = loading && progress !== null && progress !== undefined;
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060a16] px-6">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4f46e5]/15 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#38bdf8]/15 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#38bdf8]/10 to-transparent" />
      <Stars />

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative mb-9">
          {loading && (
            <span
              className="dockdo-spin-slow absolute -inset-3 rounded-3xl"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0%, rgba(99,102,241,0.5) 25%, rgba(56,189,248,0.9) 50%, transparent 75%)',
                WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))'
              }}
            />
          )}
          <div className="dockdo-rise relative">
            <img
              src="/icon.svg"
              alt="DockDo"
              className="h-24 w-24 rounded-[28px] shadow-[0_0_80px_rgba(79,70,229,0.55)]"
            />
            {!loading && (
              <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#ef4444] text-white shadow-lg">
                <AlertTriangle size={16} strokeWidth={3} />
              </span>
            )}
          </div>
        </div>

        <p className="dockdo-rise text-lg font-semibold text-slate-100" style={{ animationDelay: '0.12s' }}>
          {message || (loading ? 'Lade DockDo…' : 'Etwas ist schiefgelaufen.')}
        </p>
        {checking && status && (
          <p className="dockdo-rise mt-1 text-sm text-slate-400" style={{ animationDelay: '0.18s' }}>
            {status}
          </p>
        )}
        {!loading && detail && (
          <p className="dockdo-rise mt-1.5 text-sm text-slate-400" style={{ animationDelay: '0.2s' }}>
            {detail}
          </p>
        )}

        {loading && (
          <div className="dockdo-rise dockdo-dots mt-8" style={{ animationDelay: '0.22s' }}>
            <span className="dockdo-dot" />
            <span className="dockdo-dot" />
            <span className="dockdo-dot" />
            <span className="dockdo-dot" />
            <span className="dockdo-dot" />
          </div>
        )}

        {checking && (
          <div className="dockdo-rise mt-10 w-full max-w-lg" style={{ animationDelay: '0.24s' }}>
            <div className="mb-3 flex items-end justify-between">
              <span className="text-sm font-medium text-slate-400">
                {remaining !== null && remaining !== undefined && remaining > 0
                  ? `Noch ca. ${Math.ceil(remaining)} Sekunde${Math.ceil(remaining) === 1 ? '' : 'n'}`
                  : 'Gleich fertig…'}
              </span>
              <span className="bg-gradient-to-r from-[#818cf8] to-[#38bdf8] bg-clip-text text-5xl font-black tabular-nums leading-none text-transparent">
                {Math.round(progress || 0)}%
              </span>
            </div>
            <div className="relative h-4 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
              <div className="dockdo-shimmer absolute inset-y-0 z-10 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-[#6366f1] to-[#38bdf8] shadow-[0_0_28px_rgba(99,102,241,0.8)] transition-all duration-200 ease-out"
                style={{ width: `${Math.min(100, progress || 0)}%` }}
              />
            </div>
          </div>
        )}

        {loading && !checking && (
          <div className="dockdo-rise mt-7 w-full" style={{ animationDelay: '0.24s' }}>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="dockdo-shimmer absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-[#818cf8] to-transparent" />
            </div>
          </div>
        )}

        {!loading && onRetry && (
          <button
            className="dockdo-rise mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#38bdf8] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4f46e5]/30 transition-opacity hover:opacity-90"
            style={{ animationDelay: '0.3s' }}
            onClick={onRetry}
          >
            <RefreshCw size={15} />
            Erneut versuchen
          </button>
        )}
      </div>
    </div>
  );
}

export function useInstallCheck(onDone: (state: { done: boolean }) => void): {
  phase: 'loading' | 'done' | 'error';
  progress: number;
  remaining: number;
  status: string;
  retry: () => void;
} {
  const [phase, setPhase] = useState<'loading' | 'done' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [remaining, setRemaining] = useState(4);
  const [statusIdx, setStatusIdx] = useState(0);
  const [result, setResult] = useState<{ done: boolean } | null>(null);
  const startRef = useRef(Date.now());

  const STATUSES = ['Prüfe Datenbank…', 'Prüfe Zertifikate…', 'Prüfe Konfiguration…', 'Prüfe Installation…', 'Fast fertig…'];
  const MIN_DURATION = 2400;

  const retry = () => {
    setPhase('loading');
    setProgress(0);
    setRemaining(4);
    setStatusIdx(0);
    setResult(null);
    startRef.current = Date.now();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/setup/state');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { done: boolean };
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'loading') return;
    const iv = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const t = Math.min(1, elapsed / MIN_DURATION);
      const eased = 1 - Math.pow(1 - t, 2);
      setProgress(eased * 100);
      setRemaining(Math.max(0, (MIN_DURATION - elapsed) / 1000));
      setStatusIdx(Math.min(STATUSES.length - 1, Math.floor(t * STATUSES.length)));
    }, 80);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (result === null || phase !== 'loading') return;
    const elapsed = Date.now() - startRef.current;
    const delay = Math.max(0, MIN_DURATION - elapsed) + 250;
    const t = setTimeout(() => {
      setProgress(100);
      setRemaining(0);
      setStatusIdx(STATUSES.length - 1);
      setPhase('done');
      onDone(result);
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return {
    phase,
    progress,
    remaining,
    status: STATUSES[statusIdx],
    retry
  };
}