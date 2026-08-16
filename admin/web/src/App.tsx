import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, ListTodo, KeyRound, Palette, HardDriveDownload,
  ScrollText, Settings, LogOut, Shield
} from 'lucide-react';
import { api, setCsrf } from './api';
import { DashboardPage } from './pages/Dashboard';
import { UsersPage } from './pages/Users';
import { ListsPage } from './pages/Lists';
import { AuthPage } from './pages/Auth';
import { ThemesPage } from './pages/Themes';
import { BackupsPage } from './pages/Backups';
import { LogsPage } from './pages/Logs';
import { SettingsPage } from './pages/Settings';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'moderator' | 'user';
  status: string;
  totpEnabled: boolean;
  createdAt: string;
}

export default function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [appName, setAppName] = useState('DockDo Admin');

  const boot = async () => {
    try {
      const d = await api<{ user: AdminUser; csrf: string; appName: string }>('/api/admin/me');
      setUser(d.user);
      setCsrf(d.csrf);
      setAppName(d.appName || 'DockDo Admin');
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void boot();
  }, []);

  const logout = async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setUser(null);
    window.location.href = '/login';
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-muted">Lade Admin-Dashboard…</div>;
  }

  if (!user) {
    return <Login onSuccess={boot} appName={appName} />;
  }

  const nav = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/users', icon: Users, label: 'Benutzer' },
    { to: '/lists', icon: ListTodo, label: 'Listen & Rechte' },
    { to: '/auth', icon: KeyRound, label: 'Authentifizierung' },
    { to: '/themes', icon: Palette, label: 'Themes' },
    { to: '/backups', icon: HardDriveDownload, label: 'Backups' },
    { to: '/logs', icon: ScrollText, label: 'System / Logs' },
    { to: '/settings', icon: Settings, label: 'Einstellungen' }
  ];

  return (
    <Routes>
      <Route
        path="/*"
        element={
          <div className="flex min-h-screen bg-bg">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
              <div className="flex items-center gap-2 px-5 py-5">
                <img src="/icon.svg" alt="DockDo Admin" className="h-9 w-9" />
                <div>
                  <div className="font-bold leading-tight">{appName}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">Admin-Panel</div>
                </div>
              </div>
              <nav className="flex-1 space-y-1 px-3">
                {nav.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-theme px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-primary/10 font-semibold text-primary' : 'text-muted hover:bg-bg hover:text-ink'}`
                    }
                  >
                    <n.icon className="h-4 w-4" />
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="border-t border-line p-3">
                <div className="mb-2 flex items-center gap-2 px-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{user.name}</div>
                    <div className="flex items-center gap-1 text-[11px] text-muted">
                      <Shield className="h-3 w-3" /> Administrator
                    </div>
                  </div>
                </div>
                <button onClick={() => void logout()} className="btn-quiet w-full justify-start px-3">
                  <LogOut className="h-4 w-4" /> Abmelden
                </button>
              </div>
            </aside>

            <div className="flex-1 lg:pl-60">
              <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/90 px-5 py-3 backdrop-blur lg:hidden">
                <img src="/icon.svg" alt="DockDo Admin" className="h-8 w-8" />
                <span className="font-bold">{appName}</span>
                <div className="ml-auto flex gap-1 overflow-x-auto">
                  {nav.map((n) => (
                    <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `btn-quiet px-2 py-1 text-xs ${isActive ? 'bg-primary/10 text-primary' : ''}`}>
                      <n.icon className="h-4 w-4" />
                    </NavLink>
                  ))}
                </div>
              </header>
              <main className="p-5 lg:p-8">
                <Outlet />
              </main>
            </div>
          </div>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="lists" element={<ListsPage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="themes" element={<ThemesPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Login({ onSuccess, appName }: { onSuccess: () => Promise<void>; appName: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bg] = useState(() => {
    const bgs = ['/login-bg.jpg', '/login-bg-2.jpg', '/login-bg-3.jpg'];
    return bgs[Math.floor(Math.random() * bgs.length)];
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ needTotp?: boolean; totpToken?: string }>('/api/admin/login', { method: 'POST', body: { email, password } });
      if (res.needTotp) setTotpToken(res.totpToken || null);
      else {
        await onSuccess();
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/admin/totp', { method: 'POST', body: { totpToken, code: totp } });
      await onSuccess();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code ungültig.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="login-wrapper"
      style={{ ['--login-bg' as string]: `url('${bg}')` } as React.CSSProperties}
    >
      <div className="login-overlay" />
      <div className="login-card">
        <img src="/icon.svg" alt="" className="login-logo" />
        <h1 className="login-title">{appName}</h1>
        {!totpToken && (
          <form onSubmit={submit}>
            <div className="login-group">
              <label className="login-label" htmlFor="admin-email">E-Mail</label>
              <input
                className="login-input"
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@beispiel.de"
              />
            </div>
            <div className="login-group">
              <label className="login-label" htmlFor="admin-password">Passwort</label>
              <input
                className="login-input"
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" disabled={busy}>{busy ? 'Anmelden…' : 'Anmelden'}</button>
          </form>
        )}
        {totpToken && (
          <form onSubmit={submitTotp}>
            <div className="login-group">
              <label className="login-label" htmlFor="admin-totp">Zwei-Faktor-Code</label>
              <input
                className="login-input"
                id="admin-totp"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                inputMode="numeric"
                autoFocus
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" disabled={busy}>Bestätigen</button>
          </form>
        )}
      </div>
    </div>
  );
}