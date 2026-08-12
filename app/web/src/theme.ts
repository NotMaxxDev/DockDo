export interface ThemeConfig {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  font: string;
  radius: number;
  spacing: number;
  mode: 'light' | 'dark';
}

export const FONT_STACKS: Record<string, string> = {
  Inter: 'Inter, ui-sans-serif, system-ui, sans-serif',
  'Source Sans 3': "'Source Sans 3', ui-sans-serif, system-ui, sans-serif",
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace",
  Poppins: 'Poppins, ui-sans-serif, system-ui, sans-serif',
  Nunito: 'Nunito, ui-sans-serif, system-ui, sans-serif',
  Lora: 'Lora, ui-serif, Georgia, serif'
};

export function toChannels(value: string): string {
  const v = (value || '').trim();
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) return hexToRgb(v);
  if (v.includes(' ')) return v;
  const rgb = v.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) return rgb[1].replace(/\/.*$/, '').trim();
  return v;
}

export function applyTheme(config: ThemeConfig | null | undefined): void {
  const root = document.documentElement;
  if (!config) return;
  root.style.setProperty('--c-primary', toChannels(config.primary) || '79 70 229');
  root.style.setProperty('--c-accent', toChannels(config.accent) || '14 165 233');
  root.style.setProperty('--c-background', toChannels(config.background) || '248 250 252');
  root.style.setProperty('--c-surface', toChannels(config.surface) || '255 255 255');
  root.style.setProperty('--c-text', toChannels(config.text) || '15 23 42');
  root.style.setProperty('--c-muted', toChannels(config.muted) || '100 116 139');
  root.style.setProperty('--c-border', toChannels(config.border) || '226 232 240');
  root.style.setProperty('--c-success', toChannels(config.success) || '22 163 74');
  root.style.setProperty('--c-danger', toChannels(config.danger) || '220 38 38');
  root.style.setProperty('--c-warning', toChannels(config.warning) || '217 119 6');
  root.style.setProperty('--f-theme', FONT_STACKS[config.font || 'Inter'] || FONT_STACKS.Inter);
  root.style.setProperty('--r-theme', `${Math.max(0, Math.round(config.radius || 12))}px`);
  root.style.setProperty('--s-theme', `${config.spacing || 1}px`);
  root.style.setProperty('--tz-offset', '0');
  root.style.colorScheme = config.mode === 'dark' ? 'dark' : 'light';
  root.classList.toggle('dark', config.mode === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', config.primary || '#4f46e5');
}

export function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}