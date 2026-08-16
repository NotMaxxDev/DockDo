export const ROLES: Record<string, string> = {
  admin: 'Administrator',
  moderator: 'Moderator',
  user: 'Benutzer'
};

export const ROLE_PRIORITY: Record<string, number> = { admin: 3, moderator: 2, user: 1 };

export function roleSort(a: string, b: string): number {
  return (ROLE_PRIORITY[b] || 0) - (ROLE_PRIORITY[a] || 0);
}

export function isPrivileged(role: string): boolean {
  return role === 'admin' || role === 'moderator';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function isSameIso(a: string, b: string): boolean {
  return a === b;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function stripHtml(s: string): string {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export type ListType = 'todo' | 'shopping' | 'ideas' | 'notes' | 'projects';

export interface ListTypeInfo {
  value: ListType;
  label: string;
  icon: string;
  color: string;
}

export const LIST_TYPES: ListTypeInfo[] = [
  { value: 'todo', label: 'Aufgaben', icon: '📋', color: '#6366f1' },
  { value: 'shopping', label: 'Einkauf', icon: '🛒', color: '#14b8a6' },
  { value: 'ideas', label: 'Ideen', icon: '💡', color: '#f59e0b' },
  { value: 'notes', label: 'Notizen', icon: '📝', color: '#64748b' },
  { value: 'projects', label: 'Projekte', icon: '🚀', color: '#ec4899' }
];

export function listTypeInfo(type: string | null | undefined): ListTypeInfo {
  return LIST_TYPES.find((t) => t.value === type) || LIST_TYPES[0];
}