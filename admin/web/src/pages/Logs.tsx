import React, { useEffect, useState } from 'react';
import { ScrollText, AlertTriangle, Search } from 'lucide-react';
import { api } from '../api';

interface AuditRow {
  id: number; actorEmail: string | null; action: string; targetType: string | null;
  targetId: string | null; details: Record<string, unknown> | null; ip: string | null; createdAt: string;
}

interface ErrorRow {
  id: number; level: string; source: string; message: string; meta: Record<string, unknown> | null; createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  'auth:login': 'Login', 'auth:login-failed': 'Login fehlgeschlagen', 'auth:register': 'Registrierung',
  'auth:logout': 'Logout', 'auth:totp-enabled': '2FA aktiviert', 'auth:totp-disabled': '2FA deaktiviert',
  'user:created': 'Benutzer erstellt', 'user:updated': 'Benutzer aktualisiert', 'user:deleted': 'Benutzer gelöscht',
  'user:role-changed': 'Rolle geändert', 'user:invite': 'Einladung erstellt', 'user:session-revoked': 'Session widerrufen',
  'list:created': 'Liste erstellt', 'list:deleted': 'Liste gelöscht', 'list:updated': 'Liste aktualisiert',
  'list:shared': 'Liste geteilt', 'theme:created': 'Theme erstellt', 'theme:updated': 'Theme aktualisiert',
  'theme:deleted': 'Theme gelöscht', 'theme:default-changed': 'Standard-Theme geändert',
  'backup:target-created': 'Backup-Ziel erstellt', 'backup:manual-run': 'Backup manuell', 'backup:restored': 'Wiederherstellung',
  'backup:job-created': 'Backup-Job erstellt', 'backup:job-updated': 'Backup-Job aktualisiert', 'backup:job-deleted': 'Backup-Job gelöscht',
  'settings:smtp-updated': 'SMTP geändert', 'settings:general-updated': 'Allgemeines geändert', 'settings:smtp-test': 'SMTP-Test'
};

export function LogsPage() {
  const [tab, setTab] = useState<'audit' | 'errors'>('audit');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    const [a, e] = await Promise.all([
      api<AuditRow[]>(`/api/admin/audit?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`),
      api<ErrorRow[]>('/api/admin/errors?limit=200')
    ]);
    setAudit(a);
    setErrors(e);
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fmt = (iso: string) => new Date(iso).toLocaleString('de-DE');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Protokoll & Fehler</h1>
          <p className="text-sm text-muted">Audit-Log für sicherheitsrelevante Ereignisse und aufgetretene Fehler</p>
        </div>
        <div className="flex overflow-hidden rounded-theme border border-line">
          <button className={`px-4 py-2 text-xs font-medium ${tab === 'audit' ? 'bg-primary text-white' : 'bg-surface text-muted'}`} onClick={() => setTab('audit')}>Audit-Log</button>
          <button className={`px-4 py-2 text-xs font-medium ${tab === 'errors' ? 'bg-primary text-white' : 'bg-surface text-muted'}`} onClick={() => setTab('errors')}>Fehler ({errors.length})</button>
        </div>
      </div>

      {tab === 'audit' ? (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input className="input pl-9" placeholder="Aktion, E-Mail oder Ziel-ID filtern…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="card overflow-x-auto">
            <table className="table-base w-full">
              <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>IP</th><th>Details</th></tr></thead>
              <tbody>
                {audit.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs">{fmt(r.createdAt)}</td>
                    <td className="text-xs">{r.actorEmail || '–'}</td>
                    <td><span className="chip bg-accent/10 text-accent">{ACTION_LABELS[r.action] || r.action}</span></td>
                    <td className="font-mono text-[11px]">{r.ip || '–'}</td>
                    <td className="max-w-64 truncate text-xs text-muted" title={JSON.stringify(r.details)}>{r.details ? JSON.stringify(r.details) : '–'}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Keine Einträge.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base w-full">
            <thead><tr><th>Zeitpunkt</th><th>Quelle</th><th>Nachricht</th></tr></thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-xs">{fmt(e.createdAt)}</td>
                  <td className="font-mono text-[11px]">{e.source}</td>
                  <td>
                    <div className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                      <div>
                        <div className="break-all">{e.message}</div>
                        {e.meta && <div className="mt-0.5 font-mono text-[10px] text-muted" title={JSON.stringify(e.meta)}>{JSON.stringify(e.meta).slice(0, 300)}</div>}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {errors.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted"><ScrollText className="mx-auto mb-1 h-5 w-5" />Keine Fehler aufgezeichnet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}