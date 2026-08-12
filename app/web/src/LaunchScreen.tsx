import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface LaunchScreenProps {
  state: 'loading' | 'error';
  message?: string;
  detail?: string;
  onRetry?: () => void;
}

function Wave() {
  return (
    <svg viewBox="0 0 600 48" preserveAspectRatio="none" className="h-full w-1/2">
      <path d="M0 24 Q75 6 150 24 T300 24 T450 24 T600 24 V48 H0 Z" fill="currentColor" />
    </svg>
  );
}

export function LaunchScreen({ state, message, detail, onRetry }: LaunchScreenProps) {
  const loading = state === 'loading';
  return (
    <div className="relative flex h-full min-h-screen items-center justify-center overflow-hidden bg-bg">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44">
        <div className="dockdo-wave absolute inset-x-0 bottom-10 h-12 w-[200%] text-primary/10">
          <Wave />
          <Wave />
        </div>
        <div className="dockdo-wave-slow absolute inset-x-0 bottom-2 h-11 w-[200%] text-accent/10">
          <Wave />
          <Wave />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-primary/5 to-transparent" />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center">
        <div className="dockdo-rise relative mb-6">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-theme bg-gradient-to-br from-primary to-accent text-2xl font-black text-white shadow-xl shadow-primary/30">
            D
            {loading ? (
              <span className="dockdo-ring absolute -inset-2 rounded-theme border-2 border-primary/40" />
            ) : (
              <span className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow-md">
                <AlertTriangle size={13} strokeWidth={3} />
              </span>
            )}
          </div>
        </div>

        <div className="dockdo-rise mb-3 w-full" style={{ animationDelay: '0.1s' }}>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
            {loading ? (
              <div className="dockdo-shimmer absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
            ) : (
              <div className="absolute inset-0 rounded-full bg-danger/25" />
            )}
          </div>
        </div>

        <p className="dockdo-rise text-sm font-semibold text-ink" style={{ animationDelay: '0.18s' }}>
          {message || (loading ? 'Lade DockDo…' : 'Etwas ist schiefgelaufen.')}
        </p>
        {!loading && detail && (
          <p className="dockdo-rise mt-1 text-xs text-muted" style={{ animationDelay: '0.24s' }}>
            {detail}
          </p>
        )}
        {!loading && onRetry && (
          <button className="dockdo-rise btn-primary mt-5" style={{ animationDelay: '0.3s' }} onClick={onRetry}>
            <RefreshCw size={15} />
            Erneut versuchen
          </button>
        )}
      </div>
    </div>
  );
}
