import React, { useEffect, useState } from 'react';
import { Star, Copy, Trash2, Download, Upload, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { Modal } from './Users';

export interface ThemeConfig {
  primary: string; accent: string; background: string; surface: string; text: string;
  muted: string; border: string; success: string; danger: string; warning: string;
  font: string; radius: number; spacing: number; mode: 'light' | 'dark';
}

interface ThemeRow {
  id: string; name: string; isDefault: boolean; enabled: boolean;
  config: ThemeConfig; createdAt: string; updatedAt: string;
}

const DEFAULT_CONFIG: ThemeConfig = {
  primary: '#4f46e5', accent: '#0ea5e9', background: '#f8fafc', surface: '#ffffff',
  text: '#0f172a', muted: '#64748b', border: '#e2e8f0',
  success: '#16a34a', danger: '#dc2626', warning: '#d97706',
  font: 'Inter', radius: 12, spacing: 1, mode: 'light'
};

function toVars(c: ThemeConfig): string {
  return `--c-primary:${c.primary};--c-accent:${c.accent};--c-background:${c.background};--c-surface:${c.surface};--c-text:${c.text};--c-muted:${c.muted};--c-border:${c.border};--c-ok:${c.success};--c-danger:${c.danger};--c-warning:${c.warning};--font-sans:${c.font};--radius:${c.radius}px;`;
}

export function ThemesPage() {
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [editor, setEditor] = useState<ThemeRow | null>(null);

  const load = async () => {
    const d = await api<ThemeRow[]>('/api/admin/themes');
    setThemes(d);
  };

  useEffect(() => { void load(); }, []);

  const remove = async (t: ThemeRow) => {
    if (!confirm(`Theme „${t.name}“ löschen?`)) return;
    try {
      await api(`/api/admin/themes/${t.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  };

  const saveTheme = async (id: string, patch: { name?: string; config?: Partial<ThemeConfig>; enabled?: boolean; isDefault?: boolean }) => {
    await api(`/api/admin/themes/${id}`, { method: 'PUT', body: patch });
    await load();
  };

  const exportTheme = (t: ThemeRow) => {
    const blob = new Blob([JSON.stringify({ name: t.name, config: t.config }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `theme-${t.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importTheme = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        await api('/api/admin/themes/import', { method: 'POST', body: { name: parsed.name, config: parsed.config } });
        await load();
      } catch (err) {
        alert('Ungültige Theme-Datei: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
    input.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Themes & Erscheinungsbild</h1>
          <p className="text-sm text-muted">Designs verwalten, das Standard-Theme für alle Nutzer bestimmen</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" onClick={() => void importTheme()}><Upload className="h-3.5 w-3.5" /> Import</button>
          <button className="btn-primary text-xs" onClick={async () => {
            await api('/api/admin/themes', { method: 'POST', body: { name: 'Neues Theme', config: DEFAULT_CONFIG } });
            await load();
          }}><Plus className="h-3.5 w-3.5" /> Neues Theme</button>
        </div>
      </div>

      {themes.map((t) => (
        <div key={t.id} className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-theme text-xs font-bold" style={{ background: t.config.primary, color: t.config.surface }}>{t.name.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold">
                {t.name}
                {t.isDefault && <span className="chip bg-primary/15 text-primary"><Star className="h-3 w-3" /> Standard</span>}
                {t.config.mode === 'dark' && <span className="chip bg-line text-muted">Dark</span>}
              </div>
              <div className="text-xs text-muted">Aktualisiert: {new Date(t.updatedAt).toLocaleString('de-DE')}</div>
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="h-4 w-4" checked={t.enabled} onChange={async (e) => { await saveTheme(t.id, { enabled: e.target.checked }); }} />
              Aktiv
            </label>
            {!t.isDefault && (
              <button className="btn-quiet px-2 py-1 text-xs" title="Als Standard festlegen" onClick={() => void saveTheme(t.id, { isDefault: true })}>
                <Star className="h-3.5 w-3.5" />
              </button>
            )}
            <button className="btn-quiet px-2 py-1 text-xs" onClick={() => void api(`/api/admin/themes/${t.id}/duplicate`, { method: 'POST' }).then(load)} title="Duplizieren"><Copy className="h-3.5 w-3.5" /></button>
            <button className="btn-quiet px-2 py-1 text-xs" onClick={() => exportTheme(t)} title="Exportieren"><Download className="h-3.5 w-3.5" /></button>
            <button className="btn-quiet px-2 py-1 text-xs !text-danger" onClick={() => void remove(t)} disabled={t.isDefault} title={t.isDefault ? 'Standard-Theme kann nicht gelöscht werden' : 'Löschen'}><Trash2 className="h-3.5 w-3.5" /></button>
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditor(t)}>Bearbeiten</button>
          </div>
          <div className="flex flex-wrap gap-3 p-4">
            {[
              ['Primär', t.config.primary], ['Akzent', t.config.accent], ['Hintergrund', t.config.background], ['Fläche', t.config.surface],
              ['Text', t.config.text], ['Gedämpft', t.config.muted], ['Rahmen', t.config.border], ['Erfolg', t.config.success],
              ['Fehler', t.config.danger], ['Warnung', t.config.warning]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="h-5 w-5 rounded border border-line" style={{ background: value }} />
                <span className="text-muted">{label}</span>
                <code className="font-mono text-[10px]">{value}</code>
              </div>
            ))}
            <div className="text-xs text-muted">Radius: {t.config.radius}px · Schrift: {t.config.font} · Modus: {t.config.mode}</div>
          </div>
        </div>
      ))}

      {themes.length === 0 && <div className="card p-6 text-center text-sm text-muted">Noch keine Themes vorhanden.</div>}

      {editor && <ThemeEditor theme={editor} onSave={async (patch) => { await saveTheme(editor.id, patch); setEditor(null); }} onClose={() => setEditor(null)} />}
    </div>
  );
}

function ThemeEditor({ theme, onSave, onClose }: {
  theme: ThemeRow;
  onSave: (patch: { name?: string; config?: Partial<ThemeConfig>; enabled?: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<ThemeConfig>({ ...DEFAULT_CONFIG, ...theme.config });
  const [name, setName] = useState(theme.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof ThemeConfig, v: unknown) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({ name, config: cfg });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Theme bearbeiten: ${theme.name}`} onClose={onClose} wide>
      {error && <div className="mb-3 rounded-theme bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Modus</label>
              <select className="input" value={cfg.mode} onChange={(e) => set('mode', e.target.value)}>
                <option value="light">Hell</option>
                <option value="dark">Dunkel</option>
              </select>
            </div>
            <div>
              <label className="label">Radius (px)</label>
              <input type="number" className="input" value={cfg.radius} onChange={(e) => set('radius', Number(e.target.value))} min={0} max={32} />
            </div>
          </div>
          <div>
            <label className="label">Schrift</label>
            <input className="input" value={cfg.font} onChange={(e) => set('font', e.target.value)} placeholder="Inter" list="font-list" />
            <datalist id="font-list">
              <option value="Inter" /><option value="Roboto" /><option value="Open Sans" /><option value="Lato" /><option value="Georgia" /><option value="monospace" />
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Primärfarbe', 'primary'], ['Akzentfarbe', 'accent'], ['Hintergrund', 'background'], ['Oberfläche', 'surface'],
              ['Textfarbe', 'text'], ['Gedämpft', 'muted'], ['Rahmen', 'border'], ['Erfolg', 'success'],
              ['Fehler', 'danger'], ['Warnung', 'warning']
            ] as const).map(([label, key]) => (
              <div key={key} className="flex items-center gap-2">
                <input type="color" className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" value={cfg[key]} onChange={(e) => set(key, e.target.value)} />
                <div className="min-w-0">
                  <div className="text-xs">{label}</div>
                  <input className="input !p-1 font-mono text-[10px]" value={cfg[key]} onChange={(e) => set(key, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Live-Vorschau</label>
          <div className="overflow-hidden rounded-theme border-2 border-line transition-colors" style={{ fontFamily: cfg.font, ['--c-primary' as never]: cfg.primary, ['--c-accent' as never]: cfg.accent, ['--c-background' as never]: cfg.background, ['--c-surface' as never]: cfg.surface, ['--c-text' as never]: cfg.text, ['--c-muted' as never]: cfg.muted, ['--c-border' as never]: cfg.border, ['--c-ok' as never]: cfg.success, ['--c-danger' as never]: cfg.danger, ['--c-warning' as never]: cfg.warning, ['--radius' as never]: `${cfg.radius}px`, background: 'var(--c-background)' }}>
            <style>{`:root{${toVars(cfg)}}`}</style>
            <div className="space-y-3 p-4" style={{ background: 'var(--c-background)', color: 'var(--c-text)' }}>
              <div className="flex items-center justify-between">
                <div className="text-sm" style={{ fontFamily: cfg.font }}>Deine Aufgaben</div>
                <div className="flex gap-1.5">
                  <span className="rounded" style={{ background: 'var(--c-primary)', color: '#fff', padding: '3px 8px', fontSize: 11 }}>Öffnen</span>
                  <span className="rounded border" style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)', padding: '3px 8px', fontSize: 11 }}>Abbrechen</span>
                </div>
              </div>
              <div className="rounded" style={{ background: 'var(--c-surface)', border: `1px solid var(--c-border)`, padding: 12 }}>
                <div className="mb-1 text-xs" style={{ color: 'var(--c-muted)' }}>Montag, 10. Aug</div>
                <div className="mb-2 text-sm">Einkauf erledigen</div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded" style={{ background: 'var(--c-accent)', color: '#fff', padding: '2px 7px', fontSize: 10 }}>Privat</span>
                  <span className="rounded" style={{ background: 'var(--c-warning)', color: '#fff', padding: '2px 7px', fontSize: 10 }}>Warten</span>
                  <span className="rounded" style={{ background: 'var(--c-ok)', color: '#fff', padding: '2px 7px', fontSize: 10 }}>Fertig</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-danger)' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--c-danger)' }} /> 2 überfällig
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <RefreshCw className="h-3 w-3" /> Änderungen wirken sofort – nach dem Speichern sehen alle Nutzer das aktualisierte Theme.
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
        <button className="btn-primary" onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal>
  );
}