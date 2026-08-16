import React, { useEffect, useState } from 'react';
import { Search, Trash2, Users as UsersIcon, Plus } from 'lucide-react';
import { api } from '../api';
import { Modal } from './Users';

const LIST_TYPES = [
  { value: 'todo', label: 'Aufgaben', icon: '📋', color: '#6366f1' },
  { value: 'shopping', label: 'Einkauf', icon: '🛒', color: '#14b8a6' },
  { value: 'ideas', label: 'Ideen', icon: '💡', color: '#f59e0b' },
  { value: 'notes', label: 'Notizen', icon: '📝', color: '#64748b' },
  { value: 'projects', label: 'Projekte', icon: '🚀', color: '#ec4899' }
];

const COLOR_PRESETS = ['#6366f1', '#14b8a6', '#f59e0b', '#64748b', '#ec4899', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#f97316'];

function typeInfo(type: string | null | undefined) {
  return LIST_TYPES.find((t) => t.value === type) || LIST_TYPES[0];
}

interface ListRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: string | null;
  ownerId: string;
  ownerName?: string;
  taskCount: number;
  createdAt: string;
}

interface MemberRow { userId: string; name: string; email: string; role: 'viewer' | 'editor' | 'owner'; status: string }

interface UserRow { id: string; name: string; email: string; status: string }

export function ListsPage() {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<{ list: ListRow; members: MemberRow[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api<ListRow[]>('/api/admin/lists');
    const users = await api<{ id: string; name: string }[]>('/api/admin/users').catch(() => []);
    setRows(data.map((l) => ({ ...l, ownerName: users.find((u) => u.id === l.ownerId)?.name })));
  };

  useEffect(() => {
    void load();
  }, []);

  const openDetail = async (id: string) => {
    const d = await api<{ list: ListRow; members: MemberRow[] }>(`/api/admin/lists/${id}`);
    setDetail({ list: d.list, members: d.members });
    setError('');
  };

  const filtered = rows.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Listen & Zugriffsrechte</h1>
          <p className="text-sm text-muted">Listen erstellen und Benutzern zuweisen – Nutzer sehen nur ihre zugewiesenen Listen</p>
        </div>
        <button className="btn-primary text-xs" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> Neue Liste</button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input className="input pl-9" placeholder="Listen durchsuchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base w-full">
          <thead>
            <tr><th>Name</th><th>Typ</th><th>Owner</th><th>Aufgaben</th><th>Erstellt</th><th className="text-right">Aktionen</th></tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const t = typeInfo(l.type);
              return (
                <tr key={l.id}>
                  <td className="font-medium">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: l.color || t.color }} />
                    {l.name}
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    <span className="chip bg-line text-muted">{t.icon} {t.label}</span>
                  </td>
                  <td className="text-xs">{l.ownerName || '–'}</td>
                  <td className="text-xs">{l.taskCount}</td>
                  <td className="whitespace-nowrap text-xs">{new Date(l.createdAt).toLocaleDateString('de-DE')}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn-quiet h-7 px-2 text-xs" onClick={() => void openDetail(l.id)}><UsersIcon className="h-3.5 w-3.5" /> Rechte</button>
                      <button className="btn-quiet h-7 w-7 p-0 !text-danger" onClick={() => { if (confirm(`Liste „${l.name}“ und alle Aufgaben löschen?`)) void api(`/api/admin/lists/${l.id}`, { method: 'DELETE' }).then(load); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">Keine Listen gefunden.</td></tr>}
          </tbody>
        </table>
      </div>

      {creating && <CreateListModal onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await load(); }} />}

      {detail && (
        <Modal title={`Zugriffsrechte: ${detail.list.name}`} onClose={() => setDetail(null)} wide>
          {error && <div className="mb-3 rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div className="space-y-2">
            {detail.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 rounded-theme bg-bg p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="truncate text-xs text-muted">{m.email}</div>
                </div>
                <span className={`chip ${m.status !== 'active' ? 'bg-danger/10 text-danger' : 'bg-line text-muted'}`}>{m.status !== 'active' ? 'Gesperrt' : m.status}</span>
                <select
                  className="input !w-32 py-1 text-xs"
                  value={m.role}
                  onChange={async (e) => {
                    await api(`/api/admin/lists/${detail.list.id}/members/${m.userId}`, { method: 'PATCH', body: { role: e.target.value } });
                    await openDetail(detail.list.id);
                  }}
                >
                  <option value="viewer">Betrachter</option>
                  <option value="editor">Bearbeiter</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
            ))}
            {detail.members.length === 0 && <div className="text-sm text-muted">Keine Mitglieder.</div>}
          </div>
          <AddMemberForm listId={detail.list.id} current={detail.members} onAdded={async () => { await openDetail(detail.list.id); }} />
        </Modal>
      )}
    </div>
  );
}

function AddMemberForm({ listId, current, onAdded }: { listId: string; current: MemberRow[]; onAdded: () => Promise<void> }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<UserRow[]>('/api/admin/users').then((d) => setUsers(d.filter((u) => u.status === 'active' && !current.some((c) => c.userId === u.id)))).catch(() => undefined);
  }, [current]);

  const add = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await api(`/api/admin/lists/${listId}/members/${userId}`, { method: 'PATCH', body: { role } });
      setUserId('');
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Benutzer hinzufügen</div>
      <div className="flex flex-wrap gap-2">
        <select className="input min-w-40 flex-1" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Benutzer wählen…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
        </select>
        <select className="input w-36" value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}>
          <option value="viewer">Betrachter</option>
          <option value="editor">Bearbeiter</option>
        </select>
        <button className="btn-primary" onClick={() => void add()} disabled={busy || !userId}>Hinzufügen</button>
      </div>
    </div>
  );
}

function CreateListModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('todo');
  const [color, setColor] = useState(LIST_TYPES[0].color);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assigned, setAssigned] = useState<Record<string, 'viewer' | 'editor'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void api<UserRow[]>('/api/admin/users').then((d) => setUsers(d.filter((u) => u.status === 'active'))).catch(() => undefined);
  }, []);

  const selectType = (t: string) => {
    setType(t);
    const info = LIST_TYPES.find((x) => x.value === t);
    if (info) setColor(info.color);
  };

  const save = async () => {
    if (!name.trim()) return setError('Name erforderlich.');
    setBusy(true);
    setError('');
    try {
      const members = Object.entries(assigned).map(([userId, role]) => ({ userId, role }));
      await api('/api/admin/lists', {
        method: 'POST',
        body: { name: name.trim(), type, color, icon: typeInfo(type).icon, members }
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erstellen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Neue Liste erstellen" onClose={onClose} wide>
      {error && <div className="mb-3 rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" placeholder="z. B. Wocheneinkauf" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="label">Typ</label>
            <div className="grid grid-cols-1 gap-2">
              {LIST_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`flex items-center gap-3 rounded-theme border px-3 py-2 text-left text-sm ${type === t.value ? 'border-primary bg-primary/10' : 'border-line hover:bg-bg'}`}
                  onClick={() => selectType(t.value)}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-theme text-base" style={{ background: t.color }}>{t.icon}</span>
                  <span className="font-medium">{t.label}</span>
                  <span className="ml-auto text-xs text-muted">{t.value}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Farbe</label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-primary' : 'border-transparent'}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
              <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-line" title="Eigene Farbe">
                <span className="flex h-full w-full items-center justify-center text-[10px]" style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#10b981,#3b82f6,#a855f7,#f43f5e)' }}>+</span>
                <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <span className="h-4 w-4 rounded border border-line" style={{ background: color }} />
              <code className="font-mono">{color}</code>
            </div>
          </div>

          <div>
            <label className="label">Benutzer zuweisen ({Object.keys(assigned).length})</label>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-theme border border-line p-2">
              {users.map((u) => {
                const checked = u.id in assigned;
                return (
                  <div key={u.id} className="flex items-center gap-2 rounded-theme px-2 py-1.5 text-sm hover:bg-bg">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={(e) => {
                        setAssigned((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next[u.id] = 'viewer';
                          else delete next[u.id];
                          return next;
                        });
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{u.name}</div>
                      <div className="truncate text-xs text-muted">{u.email}</div>
                    </div>
                    {checked && (
                      <select
                        className="input !w-32 py-1 text-xs"
                        value={assigned[u.id]}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setAssigned((prev) => ({ ...prev, [u.id]: e.target.value as 'viewer' | 'editor' }))}
                      >
                        <option value="viewer">Betrachter</option>
                        <option value="editor">Bearbeiter</option>
                      </select>
                    )}
                  </div>
                );
              })}
              {users.length === 0 && <div className="py-4 text-center text-xs text-muted">Keine aktiven Benutzer vorhanden.</div>}
            </div>
            <div className="mt-1.5 text-xs text-muted">Der Ersteller (du) wird automatisch als Owner eingetragen.</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
        <button className="btn-primary" onClick={() => void save()} disabled={busy || !name.trim()}>{busy ? 'Erstelle…' : 'Liste erstellen'}</button>
      </div>
    </Modal>
  );
}