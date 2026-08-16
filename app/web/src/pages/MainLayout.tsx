import React, { useState } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { Plus, Settings, LogOut, Search, Menu, X } from 'lucide-react';
import { useStore } from '../store';

export function MainLayout() {
  const { lists, user, meta, presence, logout, createList, bootstrapped } = useStore();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [newListMode, setNewListMode] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const submitList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setBusy(true);
    try {
      const row = await createList(newListName.trim());
      setNewListMode(false);
      setNewListName('');
      navigate(`/list/${row.id}`);
      setDrawer(false);
    } finally {
      setBusy(false);
    }
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  const sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-theme bg-primary text-sm font-bold text-white">D</div>
        <span className="text-lg font-bold">{meta?.appName || 'DockDo'}</span>
      </div>
      <div className="px-3">
        <form onSubmit={submitSearch} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Listen</span>
        <button
          className="btn-quiet h-7 w-7 p-0"
          onClick={() => setNewListMode((v) => !v)}
          title="Neue Liste"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {newListMode && (
        <form onSubmit={submitList} className="px-3 pb-2">
          <input className="input" placeholder="Listenname" value={newListName} onChange={(e) => setNewListName(e.target.value)} autoFocus />
        </form>
      )}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {lists.map((l) => {
          const active = presence[l.id] || [];
          return (
            <NavLink
              key={l.id}
              to={`/list/${l.id}`}
              onClick={() => setDrawer(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-theme px-3 py-2 text-sm transition-colors ${isActive ? 'bg-primary/10 font-semibold text-primary' : 'text-ink hover:bg-bg'}`
              }
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color || 'var(--c-primary)' }} />
              <span className="flex-1 truncate">{l.name}</span>
              {l.memberRole === 'viewer' && <span className="text-[10px] uppercase text-muted">Ro</span>}
            </NavLink>
          );
        })}
        {lists.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted">Noch keine Listen. Erstelle deine erste Liste mit dem + Button.</div>}
      </nav>
      <div className="border-t border-line p-3">
        <NavLink to="/settings" onClick={() => setDrawer(false)} className="flex items-center gap-2 rounded-theme px-2 py-2 text-sm text-ink hover:bg-bg">
          <Settings className="h-4 w-4 text-muted" />
          Einstellungen
        </NavLink>
        <button onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-theme px-2 py-2 text-left text-sm text-ink hover:bg-bg">
          <LogOut className="h-4 w-4 text-muted" />
          Abmelden
        </button>
      </div>
    </div>
  );


  return (
    <div className="flex h-screen">
      <div className="hidden md:block">{sidebar}</div>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 h-full">{sidebar}</div>
          <button className="absolute left-[16.5rem] top-3 rounded-full bg-surface p-2 text-muted" onClick={() => setDrawer(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <button className="btn-quiet h-8 w-8 p-0" onClick={() => setDrawer(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold">{meta?.appName || 'DockDo'}</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto bg-bg">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const active = true;