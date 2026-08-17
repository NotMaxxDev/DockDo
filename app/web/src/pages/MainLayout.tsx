import React, { useState } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { Settings, LogOut, Search, Menu, X, LayoutDashboard, ListTodo } from 'lucide-react';
import { useStore } from '../store';

const isApp = typeof window !== 'undefined' && typeof window.DockDoBridge !== 'undefined';

export function MainLayout() {
  const { lists, user, meta, presence, logout, bootstrapped } = useStore();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState('');

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  const tabs = [
    { to: '/', label: 'Übersicht', icon: LayoutDashboard, end: true },
    { to: '/lists', label: 'Listen', icon: ListTodo, end: false },
    { to: '/search', label: 'Suche', icon: Search, end: false },
    { to: '/settings', label: 'Einstellungen', icon: Settings, end: false }
  ];

  const sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-4 py-4">
        <NavLink to="/" onClick={() => setDrawer(false)} className="flex items-center gap-2">
          <img src="/icon.svg" alt="DockDo" className="h-8 w-8" />
          <span className="text-lg font-bold">{meta?.appName || 'DockDo'}</span>
        </NavLink>
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
      <div className="px-4 pb-2 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Listen</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        <NavLink
          to="/"
          end
          onClick={() => setDrawer(false)}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-theme px-3 py-2 text-sm transition-colors ${isActive ? 'bg-primary/10 font-semibold text-primary' : 'text-ink hover:bg-bg'}`
          }
        >
          <LayoutDashboard className="h-4 w-4 text-muted" />
          Übersicht
        </NavLink>
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
        {lists.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted">
            Noch keine Listen. Ein Administrator weist dir Listen zu – sie erscheinen dann hier.
          </div>
        )}
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
      {!isApp && <div className="hidden md:block">{sidebar}</div>}
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
        <main className={`min-h-0 flex-1 overflow-y-auto bg-bg ${isApp ? 'pb-20' : ''}`}>
          <Outlet />
        </main>
        {isApp && (
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${isActive ? 'text-primary' : 'text-muted hover:text-ink'}`
              }
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </NavLink>
          ))}
          </nav>
        )}
      </div>
    </div>
  );
}