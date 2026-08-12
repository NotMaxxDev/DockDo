import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from './store';
import { SetupWizard } from './pages/Setup';
import { LoginPage } from './pages/Login';
import { MainLayout } from './pages/MainLayout';
import { BoardPage } from './pages/Board';
import { SettingsPage } from './pages/Settings';
import { SearchPage } from './pages/Search';
import { LaunchScreen } from './LaunchScreen';

export default function App() {
  const { meta, user, loading, bootstrapped } = useStore();

  if (loading) {
    return <LaunchScreen state="loading" message="Lade DockDo…" />;
  }

  if (!meta) {
    return <LaunchScreen state="error" message="Server nicht erreichbar." detail="Prüfe, ob der DockDo-Server läuft." onRetry={() => window.location.reload()} />;
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
  const [state, setState] = React.useState<'loading' | 'error'>('loading');
  const check = React.useCallback(() => {
    setState('loading');
    void (async () => {
      try {
        const res = await fetch('/api/setup/state');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { done: boolean };
        if (data.done) navigate('/login', { replace: true });
        else navigate('/setup', { replace: true });
      } catch {
        setState('error');
      }
    })();
  }, [navigate]);
  useEffect(() => {
    check();
  }, [check]);
  if (state === 'error') {
    return <LaunchScreen state="error" message="Prüfung fehlgeschlagen." detail="Der Server konnte nicht erreicht werden." onRetry={check} />;
  }
  return <LaunchScreen state="loading" message="Prüfe Installation…" />;
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