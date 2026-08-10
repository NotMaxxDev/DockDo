import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store';
import { api } from '../api';

export function SettingsPage() {
  const { user, meta, selectTheme, updateUserLocally, refreshMe } = useStore();
  const [sessions, setSessions] = useState<{ id: string; ip: string | null; userAgent: string | null; lastSeenAt: string; current?: boolean }[]>([]);
  const [locale, setLocale] = useState(user?.locale || 'de');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [notif, setNotif] = useState<Record<string, unknown>>(user?.notif || {});
  const [saved, setSaved] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUrl, setTotpUrl] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpMsg, setTotpMsg] = useState('');
  const [pushState, setPushState] = useState<'unsupported' | 'idle' | 'subscribed' | 'denied'>('idle');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ sessions: typeof sessions }>('/api/auth/me').then((d) => {
      setSessions(d.sessions || []);
      setLocale(d.user ? undefined as never : 'de');
    }).catch(() => undefined);
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    setPushState(Notification.permission === 'granted' ? 'subscribed' : Notification.permission === 'denied' ? 'denied' : 'idle');
  }, [user]);

  if (!user) return null;

  const saveSettings = async () => {
    setBusy(true);
    const res = await api<{ user: typeof user }>('/api/me/settings', { method: 'PUT', body: { locale, timezone, notif } });
    updateUserLocally(res.user);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setBusy(false);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    try {
      const res = await api<{ ok: boolean; sessionEnded?: boolean }>('/api/me/password', { method: 'POST', body: { currentPassword: pwCurrent, newPassword: pwNew } });
      if (res.sessionEnded) {
        window.location.href = '/login';
        return;
      }
      setPwMsg('Passwort geändert.');
      setPwCurrent('');
      setPwNew('');
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : 'Fehler');
    }
  };

  const setupTotp = async () => {
    const res = await api<{ secret: string; otpauthUrl: string }>('/api/me/totp/setup', { method: 'POST' });
    setTotpSecret(res.secret);
    setTotpUrl(res.otpauthUrl);
    setTotpMsg('');
  };

  const enableTotp = async () => {
    try {
      await api('/api/me/totp/enable', { method: 'POST', body: { code: totpCode } });
      setTotpMsg('TOTP aktiviert.');
      setTotpSecret('');
      setTotpUrl('');
      await refreshMe();
    } catch (err) {
      setTotpMsg(err instanceof Error ? err.message : 'Fehler');
    }
  };

  const disableTotp = async () => {
    try {
      await api('/api/me/totp/disable', { method: 'POST', body: { code: totpCode } });
      setTotpMsg('TOTP deaktiviert.');
      await refreshMe();
    } catch (err) {
      setTotpMsg(err instanceof Error ? err.message : 'Fehler');
    }
  };

  const subscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await api('/api/push/subscribe', { method: 'POST', body: { endpoint: existing.endpoint, keys: { p256dh: b64(existing.getKey('p256dh')), auth: b64(existing.getKey('auth')) } } });
      setPushState('subscribed');
      return;
    }
    const metaRes = await api<{ vapidPublicKey: string }>('/_internal/vapid').catch(() => null);
    if (!metaRes?.vapidPublicKey) {
      setPushState('unsupported');
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(metaRes.vapidPublicKey)
    });
    await api('/api/push/subscribe', { method: 'POST', body: { endpoint: sub.endpoint, keys: { p256dh: b64(sub.getKey('p256dh')), auth: b64(sub.getKey('auth')) } } });
    setPushState('subscribed');
  };

  const unsubscribePush = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
    setPushState(Notification.permission === 'granted' ? 'idle' : 'idle');
  };

  const killSession = async (id: string) => {
    await api(`/api/me/sessions/${id}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Erscheinungsbild</h2>
        <div className="flex flex-wrap gap-2">
          {meta?.themes.map((t) => (
            <button
              key={t.id}
              onClick={() => void selectTheme(t.id)}
              className={`card flex items-center gap-3 p-3 transition-colors ${user.themeId === t.id ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50'}`}
            >
              <span className="flex gap-1">
                <span className="h-4 w-4 rounded-full" style={{ background: t.config.primary }} />
                <span className="h-4 w-4 rounded-full" style={{ background: t.config.accent }} />
                <span className="h-4 w-4 rounded-full border border-line" style={{ background: t.config.surface }} />
              </span>
              <span className="text-sm font-medium">{t.name}</span>
            </button>
          ))}
          {(!meta?.themes || meta.themes.length === 0) && <div className="text-sm text-muted">Keine Themes verfügbar.</div>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Sprache & Zeitzone</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Sprache</label>
            <select className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="label">Zeitzone</label>
            <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} list="tz-list" />
            <datalist id="tz-list">
              <option value="Europe/Berlin" />
              <option value="Europe/Vienna" />
              <option value="Europe/Zurich" />
              <option value="UTC" />
              <option value="America/New_York" />
            </datalist>
          </div>
        </div>
        <button className="btn-primary mt-3" onClick={() => void saveSettings()} disabled={busy}>
          {saved ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Benachrichtigungen</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notif.push !== false} onChange={(e) => setNotif((n) => ({ ...n, push: e.target.checked }))} className="h-4 w-4" />
            Push-Benachrichtigungen
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notif.email === true} onChange={(e) => setNotif((n) => ({ ...n, email: e.target.checked }))} className="h-4 w-4" />
            E-Mail-Erinnerungen (bei fälligen Aufgaben)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notif.assignPush !== false} onChange={(e) => setNotif((n) => ({ ...n, assignPush: e.target.checked }))} className="h-4 w-4" />
            Bei Zuweisung benachrichtigen
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notif.commentPush !== false} onChange={(e) => setNotif((n) => ({ ...n, commentPush: e.target.checked }))} className="h-4 w-4" />
            Bei Kommentaren benachrichtigen
          </label>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
            <label className="text-sm">Erinnern (Minuten vor Fälligkeit)</label>
            <input type="number" className="input sm:max-w-32" min={5} step={5} value={Number(notif.dueOffsetMin ?? 60)} onChange={(e) => setNotif((n) => ({ ...n, dueOffsetMin: Number(e.target.value) }))} />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={() => void saveSettings()} disabled={busy}>{saved ? 'Gespeichert ✓' : 'Speichern'}</button>
            {pushState === 'unsupported' && <span className="text-xs text-muted">Push wird von diesem Browser nicht unterstützt oder VAPID ist nicht eingerichtet (siehe Admin).</span>}
            {pushState === 'idle' && <button className="btn-ghost" onClick={() => void subscribePush()}>Push aktivieren</button>}
            {pushState === 'subscribed' && <button className="btn-ghost" onClick={() => void unsubscribePush()}>Push deaktivieren</button>}
            {pushState === 'denied' && <span className="text-xs text-muted">Push-Berechtigung wurde vom Browser verweigert.</span>}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Zwei-Faktor-Authentifizierung</h2>
        {!user.totpEnabled && !totpSecret && (
          <button className="btn-primary" onClick={() => void setupTotp()}>TOTP einrichten</button>
        )}
        {totpSecret && (
          <div className="space-y-3">
            <div className="rounded-theme bg-bg p-3 text-sm">Scanne den QR-Code mit deiner Authenticator-App:</div>
            <QRCodeSVG value={totpUrl} size={160} className="mx-auto rounded-theme border border-line" />
            <div className="rounded-theme bg-bg p-3 text-sm">Falls du den Code nicht scannen kannst: <code className="font-mono">{totpSecret}</code></div>
            <div className="flex gap-2">
              <input className="input" placeholder="6-stelliger Code" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              <button className="btn-primary" onClick={() => void enableTotp()} disabled={totpCode.length !== 6}>Aktivieren</button>
            </div>
          </div>
        )}
        {user.totpEnabled && (
          <div className="space-y-3">
            <div className="rounded-theme bg-ok/10 px-3 py-2 text-sm text-ok">TOTP ist aktiv.</div>
            <div className="flex gap-2">
              <input className="input" placeholder="6-stelliger Code zur Bestätigung" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              <button className="btn-danger" onClick={() => void disableTotp()} disabled={totpCode.length !== 6}>Deaktivieren</button>
            </div>
          </div>
        )}
        {totpMsg && <div className="mt-2 text-sm text-muted">{totpMsg}</div>}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Aktive Sitzungen</h2>
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-theme bg-bg p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.userAgent || 'Unbekanntes Gerät'}{s.current && <span className="ml-2 text-xs text-primary">(diese Sitzung)</span>}</div>
                <div className="text-xs text-muted">{s.ip || '–'} · zuletzt aktiv: {new Date(s.lastSeenAt).toLocaleString('de-DE')}</div>
              </div>
              {!s.current && <button className="btn-quiet text-danger" onClick={() => void killSession(s.id)}>Abmelden</button>}
            </div>
          ))}
          {sessions.length === 0 && <div className="text-sm text-muted">Keine aktiven Sitzungen.</div>}
        </div>
      </section>

      {!user.oidcProvider && (
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Passwort ändern</h2>
          <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-3">
            <input className="input" type="password" placeholder="Aktuelles Passwort" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
            <input className="input" type="password" placeholder="Neues Passwort" value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
            <button className="btn-ghost" type="submit">Ändern</button>
          </form>
          {pwMsg && <div className="mt-2 text-sm text-muted">{pwMsg}</div>}
        </section>
      )}
      {user.oidcProvider && (
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Passwort</h2>
          <p className="text-sm text-muted">Dein Konto wird über den OIDC-Provider „{user.oidcProvider}“ verwaltet. Das Passwort änderst du dort.</p>
        </section>
      )}
    </div>
  );
}

function b64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64WithPadding = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64WithPadding);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}