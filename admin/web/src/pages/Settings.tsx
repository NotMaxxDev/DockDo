import React, { useEffect, useState } from 'react';
import { Mail, Send, Save, Server, Building2, KeyRound } from 'lucide-react';
import { api } from '../api';

interface SmtpSettings { host: string; port: number; secure: boolean; user: string; password: string; from: string }
interface GeneralSettings { appName: string; logoText: string; registrationDescription: string; vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string }
interface SystemInfo { dbMode: string; dataDir: string; appPort: number; adminPort: number; publicAppUrl: string; publicAdminUrl: string; node: string; platform: string }
interface SettingsData {
  smtp: SmtpSettings;
  general: GeneralSettings;
  system: SystemInfo;
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void api<SettingsData>('/api/admin/settings').then((d) => {
      setData(d);
      setSmtp(d.smtp);
      setGeneral(d.general);
    });
  }, []);

  const notify = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const saveSmtp = async () => {
    try {
      await api('/api/admin/settings/smtp', { method: 'PUT', body: smtp });
      notify('ok', 'SMTP-Einstellungen gespeichert.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    }
  };

  const testSmtp = async () => {
    setTesting(true);
    try {
      await api('/api/admin/settings/smtp/test', { method: 'POST' });
      notify('ok', 'SMTP-Verbindung erfolgreich getestet.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'SMTP-Test fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  };

  const saveGeneral = async () => {
    try {
      await api('/api/admin/settings/general', { method: 'PUT', body: general });
      notify('ok', 'Allgemeine Einstellungen gespeichert.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    }
  };

  if (!data || !smtp || !general) return <div className="text-muted">Lade…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Einstellungen</h1>
        <p className="text-sm text-muted">SMTP-Versand, App-Details und Systeminformationen</p>
      </div>

      {msg && <div className={`rounded-theme px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>{msg.text}</div>}

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><Mail className="h-4 w-4" /> SMTP-E-Mail-Versand</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Host</label>
            <input className="input" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="label">Port</label>
              <input type="number" className="input" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs"><input type="checkbox" className="h-4 w-4" checked={smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} /> SSL/TLS</label>
            </div>
          </div>
          <div>
            <label className="label">Benutzer</label>
            <input className="input" value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label className="label">Passwort</label>
            <input type="password" className="input" value={smtp.password === '••••••••' ? '' : smtp.password} placeholder={smtp.password === '••••••••' ? '•••••••• (wert bleibt gespeichert)' : ''} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} autoComplete="new-password" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Absender</label>
            <input className="input" value={smtp.from} onChange={(e) => setSmtp({ ...smtp, from: e.target.value })} placeholder="DockDo &lt;noreply@example.com&gt;" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => void saveSmtp()}><Save className="h-3.5 w-3.5" /> Speichern</button>
          <button className="btn-ghost" onClick={() => void testSmtp()} disabled={testing || !smtp.host}><Send className="h-3.5 w-3.5" /> {testing ? 'Teste…' : 'Test-E-Mail-Verbindung'}</button>
        </div>
        <p className="mt-3 text-xs text-muted">Wird für Einladungs-E-Mails, Passwort-Reset und Benachrichtigungen verwendet.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><Building2 className="h-4 w-4" /> App-Details</div>
          <div className="space-y-3">
            <div>
              <label className="label">App-Name</label>
              <input className="input" value={general.appName} onChange={(e) => setGeneral({ ...general, appName: e.target.value })} maxLength={60} />
            </div>
            <div>
              <label className="label">Logo-Text</label>
              <input className="input" value={general.logoText} onChange={(e) => setGeneral({ ...general, logoText: e.target.value })} maxLength={30} />
            </div>
            <div>
              <label className="label">Registrierungs-Hinweis (Bildschirmtext)</label>
              <textarea className="input min-h-20" value={general.registrationDescription} onChange={(e) => setGeneral({ ...general, registrationDescription: e.target.value })} />
            </div>
            <div>
              <label className="label">VAPID-Subject</label>
              <input className="input" value={general.vapidSubject} onChange={(e) => setGeneral({ ...general, vapidSubject: e.target.value })} placeholder="mailto:admin@example.com" />
            </div>
            <button className="btn-primary" onClick={() => void saveGeneral()}><Save className="h-3.5 w-3.5" /> Speichern</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><KeyRound className="h-4 w-4" /> VAPID-Status</div>
            <p className="text-sm text-muted">
              {general.vapidPublicKey
                ? <>Web-Push funktionsbereit. Öffentlicher Schlüssel: <code className="block mt-1 break-all rounded bg-bg p-2 font-mono text-[10px]">{general.vapidPublicKey.slice(0, 100)}…</code></>
                : 'Keine VAPID-Schlüssel gesetzt – Websocket- und E-Mail-Benachrichtigungen funktionieren, Browser-Push erst nach Generierung auf der Auth-Seite.'}
            </p>
          </div>
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><Server className="h-4 w-4" /> Systeminformationen</div>
            <dl className="space-y-2 text-sm">
              {([
                ['Datenbankmodus', data.system.dbMode],
                ['Datenverzeichnis', data.system.dataDir],
                ['App-Port', String(data.system.appPort)],
                ['Admin-Port', String(data.system.adminPort)],
                ['Öffentliche App-URL', data.system.publicAppUrl || '–'],
                ['Öffentliche Admin-URL', data.system.publicAdminUrl || '–'],
                ['Node.js', data.system.node],
                ['Plattform', data.system.platform]
              ] as const).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-line pb-2 last:border-0 last:pb-0">
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-all text-right font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}