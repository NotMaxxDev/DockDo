import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, MailPlus, Trash2, Ban, CheckCircle, KeyRound, Shield } from 'lucide-react';
import { api } from '../api';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'moderator' | 'user';
  status: string;
  oidcProvider: string | null;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}

const ROLE_LABEL: Record<string, string> = { admin: 'Administrator', moderator: 'Moderator', user: 'Benutzer' };

export function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | { mode: 'create' | 'invite' }>(null);
  const [invites, setInvites] = useState<{ id: string; email: string; role: string; expiresAt: string; usedAt: string | null; expired: boolean }[]>([]);
  const [tempPw, setTempPw] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api<UserRow[]>('/api/admin/users');
    setRows(data);
  };

  useEffect(() => {
    void load();
    void api('/api/admin/invites').then(setInvites as never).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (search) out = out.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
    if (status !== 'all') out = out.filter((u) => u.status === status);
    return out;
  }, [rows, search, status]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulk = async (action: 'suspend' | 'activate' | 'delete' | 'role') => {
    if (!selected.size) return;
    if (action === 'delete' && !confirm(`${selected.size} Benutzer wirklich löschen?`)) return;
    await api('/api/admin/bulk', { method: 'POST', body: { action, userIds: [...selected], role: 'user' } });
    setSelected(new Set());
    await load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body });
    await load();
  };

  const resetPassword = async (user: UserRow) => {
    const pw = prompt(`Neues Passwort für ${user.email} (leer lassen = temporär generieren):`);
    if (pw === null) return;
    const res = await api<{ ok: true }>(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { password: pw } });
    void res;
    if (!pw) {
      const fresh = await api<UserRow>(`/api/admin/users/${user.id}`, { method: 'PATCH', body: {} });
      void fresh;
    }
    await load();
    alert(pw ? 'Passwort wurde gesetzt.' : 'Bitte nutze die Passwort-Anzeige oben (Session-Reset).');
  };

  const createUser = async (e: React.FormEvent, mode: 'create' | 'invite') => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    setError('');
    try {
      const res = await api<{ temporaryPassword?: string; inviteLink?: string }>('/api/admin/users', {
        method: 'POST',
        body: {
          name: fd.get('name'), email: fd.get('email'), role: fd.get('role'),
          password: fd.get('password') || undefined,
          invite: mode === 'invite'
        }
      });
      if (mode === 'invite' && res.inviteLink) setInviteLink(res.inviteLink);
      if (mode === 'create' && res.temporaryPassword) setTempPw(res.temporaryPassword);
      setModal(null);
      await load();
      await api('/api/admin/invites').then(setInvites as never).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <h1 className="text-2xl font-bold">Benutzer</h1>
          <p className="text-sm text-muted">{rows.length} Konten · Verwaltung, Einladungen, Rollen</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ mode: 'invite' })}><MailPlus className="h-4 w-4" /> Einladen</button>
        <button className="btn-ghost" onClick={() => setModal({ mode: 'create' })}><Plus className="h-4 w-4" /> Erstellen</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-52">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input className="input pl-9" placeholder="Suchen (Name, E-Mail)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="suspended">Gesperrt</option>
          <option value="invited">Eingeladen</option>
        </select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-theme bg-bg px-3 py-1.5">
            <span className="text-xs font-semibold">{selected.size}</span>
            <button className="btn-quiet !text-danger px-2 py-1 text-xs" onClick={() => void bulk('suspend')}><Ban className="h-3.5 w-3.5" /> Sperren</button>
            <button className="btn-quiet px-2 py-1 text-xs" onClick={() => void bulk('activate')}><CheckCircle className="h-3.5 w-3.5" /> Aktivieren</button>
            <button className="btn-quiet !text-danger px-2 py-1 text-xs" onClick={() => void bulk('delete')}><Trash2 className="h-3.5 w-3.5" /> Löschen</button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base w-full">
          <thead>
            <tr>
              <th className="w-8"><input type="checkbox" className="h-4 w-4" checked={selected.size === filtered.length && filtered.length > 0} onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((u) => u.id)) : new Set())} /></th>
              <th>Name</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>2FA</th><th>Zuletzt aktiv</th><th className="text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className={u.status === 'suspended' ? 'opacity-60' : ''}>
                <td><input type="checkbox" className="h-4 w-4" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /></td>
                <td className="font-medium">{u.name}</td>
                <td className="text-xs">{u.email}{u.oidcProvider && <span className="ml-1 chip bg-accent/10 text-accent">{u.oidcProvider}</span>}</td>
                <td>
                  <select className="input !w-36 py-1 text-xs" value={u.role} onChange={(e) => void patch(u.id, { role: e.target.value })}>
                    {Object.entries(ROLE_LABEL).map(([r, l]) => <option key={r} value={r}>{l}</option>)}
                  </select>
                </td>
                <td>
                  {u.status === 'active' && <span className="chip bg-ok/10 text-ok">Aktiv</span>}
                  {u.status === 'suspended' && <span className="chip bg-danger/10 text-danger">Gesperrt</span>}
                  {u.status === 'invited' && <span className="chip bg-warn/10 text-warn">Eingeladen</span>}
                </td>
                <td className="text-xs">{u.totpEnabled ? '✓' : '–'}</td>
                <td className="whitespace-nowrap text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('de-DE') : '–'}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button className="btn-quiet h-7 w-7 p-0" title="Passwort zurücksetzen" onClick={() => void resetPassword(u)}><KeyRound className="h-3.5 w-3.5" /></button>
                    {u.status === 'active'
                      ? <button className="btn-quiet h-7 w-7 p-0 !text-danger" title="Sperren" onClick={() => void patch(u.id, { status: 'suspended' })}><Ban className="h-3.5 w-3.5" /></button>
                      : <button className="btn-quiet h-7 w-7 p-0 !text-ok" title="Aktivieren" onClick={() => void patch(u.id, { status: 'active' })}><CheckCircle className="h-3.5 w-3.5" /></button>}
                    <button className="btn-quiet h-7 w-7 p-0 !text-danger" title="Löschen" onClick={() => { if (confirm(`${u.name} wirklich löschen?`)) void api(`/api/admin/users/${u.id}`, { method: 'DELETE' }).then(load); }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-muted">Keine Benutzer gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><MailPlus className="h-4 w-4" /> Offene Einladungen</h2>
        {invites.length === 0 ? (
          <div className="text-sm text-muted">Keine offenen Einladungen.</div>
        ) : (
          <ul className="space-y-1">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{i.email}</span>
                <span className="chip bg-line text-muted">{ROLE_LABEL[i.role] || i.role}</span>
                {i.usedAt
                  ? <span className="chip bg-ok/10 text-ok">Verwendet</span>
                  : i.expired
                    ? <span className="chip bg-danger/10 text-danger">Abgelaufen</span>
                    : <span className="chip bg-warn/10 text-warn">Gültig bis {new Date(i.expiresAt).toLocaleDateString('de-DE')}</span>}
                {!i.usedAt && <button className="btn-quiet h-6 w-6 p-0 !text-danger" onClick={() => api(`/api/admin/invites/${i.id}`, { method: 'DELETE' }).then(() => api('/api/admin/invites').then(setInvites as never))}><Trash2 className="h-3.5 w-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'invite' ? 'Benutzer einladen' : 'Benutzer erstellen'} onClose={() => { setModal(null); setInviteLink(''); setTempPw(''); setError(''); }}>
          <form onSubmit={(e) => void createUser(e, modal.mode)} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input" name="name" required autoFocus />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input className="input" name="email" type="email" required />
            </div>
            <div>
              <label className="label">Rolle</label>
              <select className="input" name="role" defaultValue="user">
                <option value="user">Benutzer</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            {modal.mode === 'create' && (
              <div>
                <label className="label">Passwort (leer = temporär)</label>
                <input className="input" name="password" type="password" />
              </div>
            )}
            {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            <button className="btn-primary w-full">{modal.mode === 'invite' ? 'Einladung erstellen' : 'Benutzer anlegen'}</button>
          </form>
          {inviteLink && (
            <div className="mt-3 rounded-theme bg-bg p-3">
              <div className="mb-1 text-xs font-semibold uppercase text-muted">Einladungslink (7 Tage gültig)</div>
              <code className="block break-all text-xs">{inviteLink}</code>
              <button className="btn-ghost mt-2 w-full text-xs" onClick={() => { void navigator.clipboard.writeText(inviteLink); }}>Kopieren</button>
            </div>
          )}
          {tempPw && (
            <div className="mt-3 rounded-theme bg-bg p-3">
              <div className="mb-1 text-xs font-semibold uppercase text-muted">Temporäres Passwort</div>
              <code className="block break-all text-sm">{tempPw}</code>
              <button className="btn-ghost mt-2 w-full text-xs" onClick={() => { void navigator.clipboard.writeText(tempPw); }}>Kopieren</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-theme bg-surface p-5 sm:rounded-theme ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}