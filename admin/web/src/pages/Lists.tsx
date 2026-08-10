import React, { useEffect, useState } from 'react';
import { Search, Trash2, Users as UsersIcon } from 'lucide-react';
import { api } from '../api';
import { Modal } from './Users';

interface ListRow {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  taskCount: number;
  createdAt: string;
}

interface MemberRow { userId: string; name: string; email: string; role: 'viewer' | 'editor' | 'owner'; status: string }

export function ListsPage() {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<{ list: ListRow; members: MemberRow[] } | null>(null);
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
      <div>
        <h1 className="text-2xl font-bold">Listen & Zugriffsrechte</h1>
        <p className="text-sm text-muted">Alle Todo-Listen systemweit einsehen und Berechtigungen verwalten</p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input className="input pl-9" placeholder="Listen durchsuchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base w-full">
          <thead>
            <tr><th>Name</th><th>Owner</th><th>Aufgaben</th><th>Erstellt</th><th className="text-right">Aktionen</th></tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.name}</td>
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
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Keine Listen gefunden.</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title={`Zugriffsrechte: ${detail.list.name}`} onClose={() => setDetail(null)}>
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
        </Modal>
      )}
    </div>
  );
}