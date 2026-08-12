import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from './store';
import { SetupWizard } from './pages/Setup';
import { LoginPage } from './pages/Login';
import { MainLayout } from './pages/MainLayout';
import { BoardPage } from './pages/Board';
import { SettingsPage } from './pages/Settings';
import { SearchPage } from './pages/Search';

export default function App() {
  const { meta, user, loading, bootstrapped } = useStore();

  if (loading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-bg">
        <div className="w-64 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-theme bg-gradient-to-br from-primary to-accent text-xl font-black text-white shadow-lg shadow-primary/25">
            D
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
            <div className="dockdo-shimmer absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
          </div>
          <p className="mt-3 text-sm text-muted">Lade DockDo…</p>
        </div>
      </div>
    );
  }

  if (meta && !user && !bootstrapped) {
    const needsSetup = !meta.defaultTheme;
    void needsSetup;
    return <SetupProbe />;
  }

  return (
    <Routes>
      <Route path="/setup" element={<SetupWizard />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={user ? <MainLayout /> : <Navigate to="/login" replace />}>
        <Route index element={<BoardPage />} />
        <Route path="list/:listId" element={<BoardPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function SetupProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/setup/state');
      const state = (await res.json()) as { done: boolean };
      if (!state.done) navigate('/setup', { replace: true });
      else navigate('/login', { replace: true });
    })();
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-64 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-theme bg-gradient-to-br from-primary to-accent text-xl font-black text-white shadow-lg shadow-primary/25">
          D
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
          <div className="dockdo-shimmer absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
        </div>
        <p className="mt-3 text-sm text-muted">Prüfe Installation…</p>
      </div>
    </div>
  );
}

function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { refreshMe } = useStore();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, name, password })
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Registrierung fehlgeschlagen.');
        return d;
      });
      await refreshMe();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-bold">Konto erstellen</h1>
        <p className="mb-5 text-sm text-muted">Du wurdest von einem Administrator eingeladen. Bitte lege dein Passwort fest.</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Passwort</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <div className="rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Wird erstellt…' : 'Konto erstellen'}</button>
        </form>
      </div>
    </div>
  );
}