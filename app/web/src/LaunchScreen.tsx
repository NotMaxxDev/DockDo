import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface LaunchScreenProps {
  state: 'loading' | 'error';
  message?: string;
  detail?: string;
  onRetry?: () => void;
}

export function LaunchScreen({ state, message, detail, onRetry }: LaunchScreenProps) {
  const loading = state === 'loading';
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060a16] px-6">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4f46e5]/15 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#38bdf8]/15 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#38bdf8]/10 to-transparent" />

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative mb-7">
          <div className="dockdo-rise relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#38bdf8] text-2xl font-black text-white shadow-[0_0_60px_rgba(79,70,229,0.45)]">
            D
            {loading && <span className="dockdo-ring absolute -inset-2 rounded-2xl border-2 border-[#4f46e5]/50" />}
          </div>
          {!loading && (
            <span className="dockdo-rise absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#ef4444] text-white shadow-lg" style={{ animationDelay: '0.2s' }}>
              <AlertTriangle size={14} strokeWidth={3} />
            </span>
          )}
        </div>

        <p className="dockdo-rise text-base font-semibold text-slate-100" style={{ animationDelay: '0.12s' }}>
          {message || (loading ? 'Lade DockDo…' : 'Etwas ist schiefgelaufen.')}
        </p>
        {!loading && detail && (
          <p className="dockdo-rise mt-1.5 text-sm text-slate-400" style={{ animationDelay: '0.2s' }}>
            {detail}
          </p>
        )}

        <div className="dockdo-rise mt-6 w-full" style={{ animationDelay: '0.24s' }}>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
            {loading ? (
              <div className="dockdo-shimmer absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-[#818cf8] to-transparent" />
            ) : (
              <div className="absolute inset-0 rounded-full bg-[#ef4444]/30" />
            )}
          </div>
        </div>

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
