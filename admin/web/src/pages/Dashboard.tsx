import React, { useEffect, useState } from 'react';
import { Users, ListTodo, CheckSquare, Activity, HardDrive, Database, Clock } from 'lucide-react';
import { api } from '../api';

interface DashboardData {
  users: number;
  activeUsers: number;
  lists: number;
  tasks: number;
  sessions: number;
  heartbeat: { wsConnections?: number; lastSeen?: string; uptime?: number } | null;
  dbSize: string;
  dbSizeBytes: number;
  dbMode: string;
  uptimeAdmin: number;
  lastBackups: { id: string; filename: string; status: string; createdAt: string; size: number }[];
  recentAudit: { id: number; action: string; actorEmail: string | null; createdAt: string; targetType: string | null }[];
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void api<DashboardData>('/api/admin/dashboard').then(setData).catch(() => undefined);
  }, []);

  if (!data) return <div className="text-muted">Lade…</div>;

  const cards = [
    { label: 'Aktive Benutzer', value: data.activeUsers, sub: `${data.users} gesamt`, icon: Users, color: 'text-primary bg-primary/10' },
    { label: 'Listen', value: data.lists, sub: 'systemweit', icon: ListTodo, color: 'text-accent bg-accent/10' },
    { label: 'Aufgaben', value: data.tasks, sub: 'in allen Listen', icon: CheckSquare, color: 'text-ok bg-ok/10' },
    { label: 'Aktive Sessions', value: data.sessions, sub: `WS: ${data.heartbeat?.wsConnections ?? '–'}`, icon: Activity, color: 'text-warn bg-warn/10' }
  ];

  const statusBadge = (s: string) =>
    s === 'ok' ? <span className="chip bg-ok/10 text-ok">OK</span> : <span className="chip bg-danger/10 text-danger">Fehler</span>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">Systemübersicht</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-theme ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted">{c.label}</div>
            <div className="mt-1 text-[11px] text-muted/70">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <Activity className="h-4 w-4" /> System-Health
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-theme bg-bg p-3">
              <div className="flex items-center gap-2 text-muted"><HardDrive className="h-4 w-4" /> Datenbank-Größe</div>
              <div className="mt-1 text-lg font-semibold">{data.dbSize}</div>
            </div>
            <div className="rounded-theme bg-bg p-3">
              <div className="flex items-center gap-2 text-muted"><Database className="h-4 w-4" /> DB-Modus</div>
              <div className="mt-1 text-lg font-semibold capitalize">{data.dbMode}</div>
            </div>
            <div className="rounded-theme bg-bg p-3">
              <div className="flex items-center gap-2 text-muted"><Clock className="h-4 w-4" /> Uptime Admin</div>
              <div className="mt-1 text-lg font-semibold">{Math.floor(data.uptimeAdmin / 60)} min</div>
            </div>
            <div className="rounded-theme bg-bg p-3">
              <div className="flex items-center gap-2 text-muted"><Activity className="h-4 w-4" /> App-Heartbeat</div>
              <div className="mt-1 text-lg font-semibold">
                {data.heartbeat?.lastSeen ? new Date(data.heartbeat.lastSeen).toLocaleTimeString('de-DE') : '–'}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Letzte Backups</h2>
          {data.lastBackups.length === 0 ? (
            <div className="text-sm text-muted">Noch keine Backups erstellt.</div>
          ) : (
            <div className="space-y-2">
              {data.lastBackups.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-theme bg-bg px-3 py-2 text-sm">
                  <span className="flex-1 truncate font-mono text-xs">{b.filename}</span>
                  <span className="text-xs text-muted">{(b.size / 1024).toFixed(1)} KB</span>
                  {statusBadge(b.status)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Letzte Admin-Aktionen (Audit)</h2>
        <table className="table-base w-full">
          <thead>
            <tr>
              <th>Zeit</th><th>Aktion</th><th>Ausführender</th><th>Ziel</th>
            </tr>
          </thead>
          <tbody>
            {data.recentAudit.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs">{new Date(a.createdAt).toLocaleString('de-DE')}</td>
                <td><code className="text-xs">{a.action}</code></td>
                <td className="text-xs">{a.actorEmail || 'System'}</td>
                <td className="text-xs text-muted">{a.targetType || '–'}{a.targetId ? ` / ${String(a.targetId).slice(0, 8)}…` : ''}</td>
              </tr>
            ))}
            {data.recentAudit.length === 0 && (
              <tr><td colSpan={4} className="py-3 text-center text-muted">Noch keine Aktionen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}