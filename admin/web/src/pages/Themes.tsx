import React, { useEffect, useState } from 'react';
import { Star, Copy, Trash2, Download, Upload, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../api';
import { getNatureBackground } from '../natureBackgrounds';
import { Modal } from './Users';

export interface ThemeConfig {
  primary: string; accent: string; background: string; surface: string; text: string;
  muted: string; border: string; success: string; danger: string; warning: string;
  font: string; radius: number; spacing: number; mode: 'light' | 'dark';
  glass: boolean;
}

interface ThemeRow {
  id: string; name: string; isDefault: boolean; enabled: boolean;
  config: ThemeConfig; createdAt: string; updatedAt: string;
}

const DEFAULT_CONFIG: ThemeConfig = {
  primary: '#6366f1', accent: '#38bdf8', background: '#060b18', surface: '#0d1526',
  text: '#e5edf7', muted: '#94a3b8', border: '#1c2a44',
  success: '#34d399', danger: '#f87171', warning: '#fbbf24',
  font: 'Inter', radius: 12, spacing: 1, mode: 'dark', glass: false
};

function toVars(c: ThemeConfig): Record<string, string> {
  return {
    '--c-primary': c.primary, '--c-accent': c.accent, '--c-background': c.background, '--c-surface': c.surface,
    '--c-text': c.text, '--c-muted': c.muted, '--c-border': c.border, '--c-ok': c.success, '--c-success': c.success,
    '--c-danger': c.danger, '--c-warning': c.warning, '--radius': `${c.radius}px`
  };
}

let previewBg: string | null = null;
function getPreviewBackground(): string {
  if (!previewBg) previewBg = getNatureBackground();
  return previewBg;
}

function ThemePreview({ cfg }: { cfg: ThemeConfig }) {
  const vars = toVars(cfg) as React.CSSProperties;
  const g = !!cfg.glass;
  const glass = (pct: number) => `color-mix(in srgb, ${cfg.surface} ${pct}%, transparent)`;
  const blur: React.CSSProperties = g ? { backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } : {};
  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{
        ...vars,
        fontFamily: cfg.font,
        background: g ? `url('${getPreviewBackground()}')` : 'var(--c-background)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: 'var(--c-text)',
        borderColor: 'var(--c-border)'
      }}
    >
      {g && <div className="pointer-events-none absolute inset-0" style={{ background: 'rgb(8 12 22 / 0.45)' }} />}
      <div className="relative flex">
        <div className="hidden w-16 shrink-0 flex-col gap-1.5 p-2 sm:flex" style={{ background: g ? glass(25) : 'var(--c-surface)', borderRight: '1px solid var(--c-border)', ...blur }}>
          <div className="mb-1 flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: 'var(--c-primary)' }}>D</div>
          <div className="h-2 w-10 rounded-full" style={{ background: 'var(--c-primary)', opacity: 0.8 }} />
          <div className="h-2 w-8 rounded-full" style={{ background: 'var(--c-border)' }} />
          <div className="h-2 w-9 rounded-full" style={{ background: 'var(--c-border)' }} />
        </div>
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] font-bold">{cfg.mode === 'dark' ? 'Dunkles Theme' : 'Helles Theme'}{g && ' · Glass'}</div>
            <div className="flex shrink-0 gap-1">
              <span className="rounded px-2 py-0.5 text-[9px] font-semibold text-white" style={{ background: 'var(--c-primary)' }}>Anmelden</span>
              <span className="rounded border px-2 py-0.5 text-[9px]" style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>Abbrechen</span>
            </div>
          </div>
          <div className="rounded-lg p-2" style={{ background: g ? glass(30) : 'var(--c-surface)', border: '1px solid var(--c-border)', ...blur }}>
            <div className="mb-1 text-[9px]" style={{ color: 'var(--c-muted)' }}>Montag, 10. Aug</div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px]">
              <span className="h-3 w-3 shrink-0 rounded" style={{ background: 'var(--c-primary)', opacity: 0.9 }} />
              <span className="truncate">Einkauf erledigen</span>
            </div>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--c-border)' }}>
              <div className="h-full w-2/3 rounded-full" style={{ background: 'var(--c-primary)' }} />
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold text-white" style={{ background: 'var(--c-accent)' }}>Privat</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold text-white" style={{ background: 'var(--c-warning)' }}>Warten</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold text-white" style={{ background: 'var(--c-ok)' }}>Fertig</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="min-w-0 flex-1 rounded border px-2 py-1 text-[9px]" style={{ borderColor: 'var(--c-border)', background: g ? glass(30) : 'var(--c-surface)', color: 'var(--c-muted)', ...blur }}>E-Mail-Adresse</div>
            <div className="shrink-0 rounded px-2.5 py-1 text-[9px] font-semibold text-white" style={{ background: 'var(--c-primary)' }}>Suchen</div>
          </div>
          <div className="flex items-center gap-1.5 text-[9px]" style={{ color: 'var(--c-danger)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--c-danger)' }} /> 2 überfällig
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemesPage() {
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [editor, setEditor] = useState<{ theme: ThemeRow | null } | null>(null);

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

  const saveEditor = async (theme: ThemeRow | null, name: string, cfg: ThemeConfig) => {
    if (theme) {
      await api(`/api/admin/themes/${theme.id}`, { method: 'PUT', body: { name, config: cfg } });
    } else {
      await api('/api/admin/themes', { method: 'POST', body: { name, config: cfg } });
    }
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
          <button className="btn-primary text-xs" onClick={() => setEditor({ theme: null })}><Plus className="h-3.5 w-3.5" /> Neues Theme</button>
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
                {!!t.config.glass && <span className="chip bg-primary/15 text-primary"><Sparkles className="h-3 w-3" /> Glass</span>}
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
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditor({ theme: t })}>Bearbeiten</button>
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
            <div className="text-xs text-muted">Radius: {t.config.radius}px · Schrift: {t.config.font} · Modus: {t.config.mode}{!!t.config.glass && ' · Glas-Effekt'}</div>
          </div>
        </div>
      ))}

      {themes.length === 0 && <div className="card p-6 text-center text-sm text-muted">Noch keine Themes vorhanden.</div>}

      {editor && (
        <ThemeEditor
          key={editor.theme ? editor.theme.id : 'new'}
          theme={editor.theme}
          onSave={async (name, cfg) => {
            try {
              await saveEditor(editor.theme, name, cfg);
              setEditor(null);
            } catch (err) {
              throw err;
            }
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function ThemeEditor({ theme, onSave, onClose }: {
  theme: ThemeRow | null;
  onSave: (name: string, config: ThemeConfig) => Promise<void>;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<ThemeConfig>({ ...DEFAULT_CONFIG, ...(theme ? theme.config : {}) });
  const [name, setName] = useState(theme?.name || 'Neues Theme');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof ThemeConfig, v: unknown) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(name.trim(), cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={theme ? `Theme bearbeiten: ${theme.name}` : 'Neues Theme erstellen'} onClose={onClose} wide>
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
          <label className="flex cursor-pointer items-center gap-2 rounded-theme border border-line p-3">
            <input type="checkbox" className="h-4 w-4" checked={!!cfg.glass} onChange={(e) => set('glass', e.target.checked)} />
            <div>
              <div className="text-sm font-semibold">Glas-Effekt (Glassmorphism)</div>
              <div className="text-xs text-muted">Transluzente Flächen mit Blur über zufälligem Hintergrundbild – der „Viral"-Look</div>
            </div>
          </label>
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
          <ThemePreview cfg={cfg} />
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <RefreshCw className="h-3 w-3" /> Änderungen wirken sofort – nach dem Speichern sehen alle Nutzer das aktualisierte Theme.
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
        <button className="btn-primary" onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? 'Speichern…' : theme ? 'Speichern' : 'Erstellen'}</button>
      </div>
    </Modal>
  );
}