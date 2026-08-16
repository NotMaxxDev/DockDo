import React, { useEffect, useState } from 'react';
import { X, Download, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'dockdo-pwa-dismiss';
const REAPPEAR_DAYS = 14;

function isMobile(): boolean {
  const touch = navigator.maxTouchPoints > 0;
  const small = window.matchMedia('(max-width: 1024px)').matches;
  return (touch && small) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!ts) return false;
    return Date.now() - ts < REAPPEAR_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function PwaBanner() {
  const [visible, setVisible] = useState(false);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (!isMobile() || isStandalone() || isDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    if (isIOS()) {
      setIos(true);
      setVisible(true);
      return () => window.removeEventListener('beforeinstallprompt', onPrompt);
    }

    const t = setTimeout(() => setVisible(true), 4000);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      clearTimeout(t);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  const install = async () => {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setVisible(false);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96">
      <div className="rounded-theme border border-line bg-surface p-4 shadow-xl" style={{ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">D</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">DockDo installieren</div>
            <div className="truncate text-xs text-muted">{ios ? 'Zum Home-Bildschirm hinzufügen' : 'Schneller Zugriff auf deine Aufgaben'}</div>
          </div>
          <button onClick={dismiss} className="rounded-full p-1.5 text-muted transition-colors hover:bg-line hover:text-ink" title="Nicht mehr anzeigen">
            <X className="h-4 w-4" />
          </button>
        </div>
        {ios ? (
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Tippe im Browser auf das <Share className="inline h-3.5 w-3.5" /> Teilen-Symbol und wähle dann <strong className="text-ink">„Zum Home-Bildschirm“</strong>.
          </p>
        ) : prompt ? (
          <p className="mb-3 text-xs leading-relaxed text-muted">Füge DockDo zu deinem Home-Bildschirm hinzu – deine Aufgaben sind dann nur einen Tipp entfernt.</p>
        ) : (
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Öffne das Menü (<span className="font-mono">⋮</span>) im Browser und wähle <strong className="text-ink">„App installieren“</strong> oder <strong className="text-ink">„Zum Home-Bildschirm“</strong>.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-quiet px-3 py-1.5 text-xs" onClick={dismiss}>Später</button>
          {!ios && prompt && (
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => void install()}>
              <Download className="h-3.5 w-3.5" /> Installieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}