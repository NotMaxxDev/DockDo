import React, { useEffect, useState } from 'react';
import { HardDrive, Cloud, FolderOpen, Plus, Trash2, Play, RotateCcw, DatabaseBackup, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { Modal } from './Users';

interface BackupTarget {
  id: string; name: string; type: 'local' | 's3' | 'smb'; enabled: boolean;
  config: Record<string, unknown>;
}

interface BackupJob {
  id: string; name: string; targetId: string; targetName: string; schedule: string;
  retention: { daily: number; weekly: number; monthly: number };
  enabled: boolean; lastRunAt: string | null; lastStatus: 'success' | 'error' | null; lastError: string | null;
}

interface BackupRow {
  id: string; filename: string; size: number; status: string; createdAt: string;
  targetId: string; targetName: string; jobName?: string;
}

const CRON_PRESETS = [
  ['24 h', '0 3 * * *'],
  ['12 h', '0 */12 * * *'],
  ['Wöchentlich', '0 3 * * 0'],
  ['Monatlich', '0 3 1 * *'],
  ['Alle 6 h', '0 */6 * * *']
];

const LOCAL_FIELDS: Array<[keyof BackupTarget['config'], string]> = [['path', 'Zielordner (absolut, Standard: ./data/backups)']];
const S3_FIELDS: Array<[keyof BackupTarget['config'], string]> = [
  ['bucket', 'Bucket-Name'], ['endpoint', 'Endpoint (z. B. MinIO; leer = AWS)'],
  ['region', 'Region'], ['accessKeyId', 'Access Key ID'], ['secretAccessKey', 'Secret Access Key'],
  ['pathPrefix', 'Prefix im Bucket (Standard: dockdo-backups)']
];
const SMB_FIELDS: Array<[keyof BackupTarget['config'], string]> = [
  ['host', 'Host/IP des SMB-Servers'], ['share', 'Freigabename'], ['username', 'Benutzer'],
  ['password', 'Passwort'], ['domain', 'Domäne (optional)']
];

const TARGET_META: Record<BackupTarget['type'], { icon: typeof HardDrive; color: string }> = {
  local: { icon: FolderOpen, color: 'text-ok' },
  s3: { icon: Cloud, color: 'text-accent' },
  smb: { icon: HardDrive, color: 'text-warning' }
};

export function BackupsPage() {
  const [targets, setTargets] = useState<BackupTarget[]>([]);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [targetModal, setTargetModal] = useState<null | { edit?: BackupTarget }>(null);
  const [jobModal, setJobModal] = useState<null | { edit?: BackupJob }>(null);
  const [restore, setRestore] = useState<BackupRow | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [t, j, b] = await Promise.all([
      api<BackupTarget[]>('/api/admin/backup-targets'),
      api<BackupJob[]>('/api/admin/backup-jobs'),
      api<BackupRow[]>('/api/admin/backups')
    ]);
    setTargets(t); setJobs(j); setBackups(b);
  };

  useEffect(() => { void load(); }, []);

  const notify = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const runNow = async (targetId: string, jobId?: string) => {
    setRunning(true);
    try {
      await api('/api/admin/backups/run', { method: 'POST', body: { targetId, jobId } });
      notify('ok', 'Backup gestartet.');
      await load();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Backup fehlgeschlagen');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Backups & Wiederherstellung</h1>
          <p className="text-sm text-muted">Sicherungsziele (lokal / S3-kompatibel / SMB) und automatische Jobs mit Aufbewahrungsregeln</p>
        </div>
        <button className="btn-primary text-xs" onClick={() => setTargetModal({})}><Plus className="h-3.5 w-3.5" /> Ziel hinzufügen</button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-theme px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
          {msg.type === 'ok' ? <DatabaseBackup className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Sicherungsziele</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {targets.map((t) => {
            const meta = TARGET_META[t.type];
            const Icon = meta.icon;
            return (
              <div key={t.id} className="rounded-theme bg-bg p-4">
                <div className="flex items-start gap-3">
                  <Icon className={`h-8 w-8 shrink-0 ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold">
                      {t.name}
                      <span className={`chip ${t.enabled ? 'bg-ok/10 text-ok' : 'bg-line text-muted'}`}>{t.enabled ? 'Aktiv' : 'Inaktiv'}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted capitalize">{t.type === 's3' ? 'S3-kompatibel' : t.type === 'smb' ? 'SMB-Freigabe' : 'Lokaler Ordner'}</div>
                    <div className="mt-1 truncate text-[11px] text-muted">
                      {t.type === 'local' && String(t.config.path || './data/backups')}
                      {t.type === 's3' && `${String(t.config.bucket)}${t.config.endpoint ? ' · ' + String(t.config.endpoint) : ''}`}
                      {t.type === 'smb' && `//${String(t.config.host)}/${String(t.config.share)}`}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button className="btn-quiet h-7 px-2 text-xs" disabled={running} onClick={() => void runNow(t.id)}><Play className="h-3 w-3" /> Jetzt sichern</button>
                  <button className="btn-quiet h-7 px-2 text-xs" onClick={() => setTargetModal({ edit: t })}>Bearbeiten</button>
                  <button className="btn-quiet h-7 w-7 p-0 !text-danger" onClick={() => { if (confirm('Ziel inkl. aller Jobs und Backups-Einträge löschen?')) void api(`/api/admin/backup-targets/${t.id}`, { method: 'DELETE' }).then(load).then(() => notify('ok', 'Ziel gelöscht.')); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {targets.length === 0 && <div className="text-sm text-muted md:col-span-2 xl:col-span-3">Noch keine Sicherungsziele. Füge ein lokales Ziel, einen S3-Bucket oder eine SMB-Freigabe hinzu.</div>}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Automatische Backup-Jobs</h2>
          <button className="btn-ghost text-xs" disabled={targets.length === 0} onClick={() => setJobModal({})}><Plus className="h-3.5 w-3.5" /> Job anlegen</button>
        </div>
        <div className="space-y-2">
          {jobs.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center gap-3 rounded-theme bg-bg p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {j.name}
                  <span className={`chip ${j.enabled ? 'bg-ok/10 text-ok' : 'bg-line text-muted'}`}>{j.enabled ? 'Aktiv' : 'Pausiert'}</span>
                </div>
                <div className="text-xs text-muted">
                  <code className="font-mono">{j.schedule}</code> → {j.targetName} · Aufbewahrung {j.retention.daily}d/{j.retention.weekly}w/{j.retention.monthly}m
                  {j.lastRunAt && <span className="ml-2">Letzter Lauf: {new Date(j.lastRunAt).toLocaleString('de-DE')} {j.lastStatus === 'success' ? '✓' : j.lastStatus === 'error' ? '✗' : ''}</span>}
                </div>
                {j.lastError && <div className="mt-0.5 truncate text-xs text-danger">{j.lastError}</div>}
              </div>
              <button className="btn-quiet h-7 px-2 text-xs" disabled={running} onClick={() => void runNow(j.targetId, j.id)}><Play className="h-3 w-3" /></button>
              <button className="btn-quiet h-7 px-2 text-xs" onClick={() => setJobModal({ edit: j })}>Bearbeiten</button>
              <button className="btn-quiet h-7 w-7 p-0 !text-danger" onClick={() => { if (confirm('Backup-Job löschen?')) void api(`/api/admin/backup-jobs/${j.id}`, { method: 'DELETE' }).then(load); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {jobs.length === 0 && <div className="text-sm text-muted">Keine Jobs. Lege z. B. einen täglichen Job mit Cron <code className="font-mono">0 3 * * *</code> an.</div>}
        </div>
      </div>

      <div className="card overflow-x-auto p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Vollständige Sicherungen</h2>
        <table className="table-base w-full">
          <thead>
            <tr><th>Datei</th><th>Ziel</th><th>Job</th><th>Größe</th><th>Status</th><th>Erstellt</th><th className="text-right">Aktionen</th></tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id}>
                <td className="font-mono text-xs">{b.filename}</td>
                <td className="text-xs">{b.targetName}</td>
                <td className="text-xs">{b.jobName || 'Manuell'}</td>
                <td className="text-xs">{b.size ? `${(b.size / 1024 / 1024).toFixed(2)} MB` : '–'}</td>
                <td><span className={`chip ${b.status === 'success' ? 'bg-ok/10 text-ok' : b.status === 'error' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>{b.status}</span></td>
                <td className="whitespace-nowrap text-xs">{new Date(b.createdAt).toLocaleString('de-DE')}</td>
                <td>
                  <div className="flex justify-end">
                    {b.status === 'success' && (
                      <button className="btn-quiet h-7 px-2 text-xs" onClick={() => setRestore(b)}><RotateCcw className="h-3 w-3" /> Wiederherstellen</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {backups.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted">Noch keine Sicherungen vorhanden.</td></tr>}
          </tbody>
        </table>
      </div>

      {targetModal && <TargetModal edit={targetModal.edit} onClose={() => setTargetModal(null)} onSaved={async () => { setTargetModal(null); await load(); }} />}
      {jobModal && <JobModal edit={jobModal.edit} targets={targets} onClose={() => setJobModal(null)} onSaved={async () => { setJobModal(null); await load(); }} />}
      {restore && <RestoreModal backup={restore} onClose={() => setRestore(null)} onDone={(ok, text) => { setRestore(null); notify(ok ? 'ok' : 'err', text); void load(); }} />}
    </div>
  );
}

function TargetModal({ edit, onClose, onSaved }: { edit?: BackupTarget; onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<BackupTarget['type']>(edit?.type || 'local');
  const [name, setName] = useState(edit?.name || '');
  const [cfg, setCfg] = useState<Record<string, unknown>>(edit?.config || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fields = type === 's3' ? S3_FIELDS : type === 'smb' ? SMB_FIELDS : LOCAL_FIELDS;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (edit) {
        await api(`/api/admin/backup-targets/${edit.id}`, { method: 'PUT', body: { name, config: cfg } });
      } else {
        await api('/api/admin/backup-targets', { method: 'POST', body: { name, type, config: cfg } });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={edit ? 'Ziel bearbeiten' : 'Neues Sicherungsziel'} onClose={onClose}>
      {error && <div className="mb-3 rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. NAS-Freigabe" />
        </div>
        {!edit && (
          <div>
            <label className="label">Typ</label>
            <div className="grid grid-cols-3 gap-2">
              {(['local', 's3', 'smb'] as const).map((t) => {
                const Icon = TARGET_META[t].icon;
                return (
                  <button key={t} onClick={() => { setType(t); setCfg({}); }} className={`card flex flex-col items-center gap-1 px-2 py-3 text-xs ${type === t ? 'border-primary text-primary ring-2 ring-primary/30' : 'text-muted'}`}>
                    <Icon className="h-5 w-5" />{t === 's3' ? 'S3' : t === 'smb' ? 'SMB' : 'Lokal'}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="space-y-2">
          {fields.map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                className="input"
                type={key === 'secretAccessKey' || key === 'password' ? 'password' : 'text'}
                value={String(cfg[key] ?? '')}
                onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy || !name.trim()} >{busy ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </Modal>
  );
}

function JobModal({ edit, targets, onClose, onSaved }: { edit?: BackupJob; targets: BackupTarget[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(edit?.name || '');
  const [targetId, setTargetId] = useState(edit?.targetId || targets[0]?.id || '');
  const [schedule, setSchedule] = useState(edit?.schedule || '0 3 * * *');
  const [retention, setRetention] = useState(edit?.retention || { daily: 7, weekly: 4, monthly: 12 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { name, targetId, schedule, retention };
      if (edit) await api(`/api/admin/backup-jobs/${edit.id}`, { method: 'PUT', body });
      else await api('/api/admin/backup-jobs', { method: 'POST', body });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={edit ? 'Backup-Job bearbeiten' : 'Neuer Backup-Job'} onClose={onClose}>
      {error && <div className="mb-3 rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Tägliches Backup" />
        </div>
        <div>
          <label className="label">Ziel</label>
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Zeitplan (Cron, 5 Felder)</label>
          <input className="input font-mono text-xs" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CRON_PRESETS.map(([label, expr]) => (
              <button key={expr} className={`chip cursor-pointer ${schedule === expr ? 'bg-primary/15 text-primary' : 'bg-line text-muted'}`} onClick={() => setSchedule(expr)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Täglich (Anz.)</label><input type="number" className="input" value={retention.daily} min={0} onChange={(e) => setRetention((r) => ({ ...r, daily: Number(e.target.value) }))} /></div>
          <div><label className="label">Wöchentlich</label><input type="number" className="input" value={retention.weekly} min={0} onChange={(e) => setRetention((r) => ({ ...r, weekly: Number(e.target.value) }))} /></div>
          <div><label className="label">Monatlich</label><input type="number" className="input" value={retention.monthly} min={0} onChange={(e) => setRetention((r) => ({ ...r, monthly: Number(e.target.value) }))} /></div>
        </div>
        <p className="text-xs text-muted">Aufbewahrung: rotierende Sicherungen pro Zeitraum (0 = deaktiviert).</p>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy || !name.trim() || !targetId}>{busy ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </Modal>
  );
}

function RestoreModal({ backup, onClose, onDone }: { backup: BackupRow; onClose: () => void; onDone: (ok: boolean, text: string) => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/backups/${backup.id}/restore`, { method: 'POST', body: { confirm: confirmText } });
      onDone(true, 'Wiederherstellung abgeschlossen.');
    } catch (err) {
      onDone(false, err instanceof Error ? err.message : 'Wiederherstellung fehlgeschlagen');
    }
  };

  return (
    <Modal title="Sicherung wiederherstellen" onClose={onClose}>
      <div className="mb-4 rounded-theme bg-danger/10 p-3 text-sm leading-relaxed text-danger">
        <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Achtung</div>
        Die aktuellen Daten (Listen, Aufgaben, Benutzer, Einstellungen) werden durch diese Sicherung ersetzt. Vor dem Wiederherstellen wird automatisch eine Notfall-Sicherung der aktuellen Daten erstellt.
        <div className="mt-2 text-xs text-muted">{backup.filename} · {new Date(backup.createdAt).toLocaleString('de-DE')}</div>
      </div>
      <label className="label">Zur Bestätigung „RESTORE“ eingeben:</label>
      <input className="input font-mono" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
        <button className="btn-danger" onClick={() => void restore()} disabled={busy || confirmText !== 'RESTORE'}>{busy ? 'Wiederherstellen…' : 'Wiederherstellen'}</button>
      </div>
    </Modal>
  );
}