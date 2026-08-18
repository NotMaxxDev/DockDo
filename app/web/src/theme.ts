import { getNatureBackground } from './natureBackgrounds';

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
  glass: boolean;
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

let sessionBg: string | null = null;

export function getSessionBackground(): string {
  if (!sessionBg) sessionBg = getNatureBackground();
  return sessionBg;
}

export function applyTheme(config: ThemeConfig | null | undefined, accent?: string | null): void {
  const root = document.documentElement;
  if (!config) return;
  const primary = isValidHex(accent || '') ? accent!.trim() : config.primary;
  root.style.setProperty('--c-primary', toChannels(primary) || '79 70 229');
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
  root.style.colorScheme = config.mode === 'dark' ? 'dark' : 'light';
  root.classList.toggle('dark', config.mode === 'dark');
  root.classList.toggle('glass', !!config.glass);
  if (config.glass) {
    root.style.setProperty('--app-bg', `url('${getSessionBackground()}')`);
  } else {
    root.style.removeProperty('--app-bg');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', primary || '#4f46e5');
}

export function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function isValidHex(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((value || '').trim());
}

export function relativeLuminance(hex: string): number {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return (
    0.2126 * f(((n >> 16) & 255) / 255) +
    0.7152 * f(((n >> 8) & 255) / 255) +
    0.0722 * f((n & 255) / 255)
  );
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}