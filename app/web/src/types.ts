export interface TaskDto {
  id: string;
  listId: string;
  title: string;
  description: string;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  sortOrder: number;
  assigneeId: string | null;
  recurrence: unknown | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  labels: { id: string; name: string; color: string }[];
  subtasks: { id: string; taskId: string; title: string; done: boolean; createdAt: string }[];
}

export interface ListDto {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: string | null;
  ownerId: string;
  memberRole: 'owner' | 'editor' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'moderator' | 'user';
  status: string;
  locale: string;
  timezone: string;
  themeId: string | null;
  notif: Record<string, unknown>;
  oidcProvider: string | null;
  totpEnabled: boolean;
  createdAt: string;
}

export interface ThemeMeta {
  id: string;
  name: string;
  isDefault: boolean;
  config: import('./theme').ThemeConfig;
}

export interface Meta {
  appName: string;
  authMode: 'local' | 'oidc' | 'both';
  oidcProviders: { id: string; name: string; provider: string }[];
  themes: ThemeMeta[];
  defaultTheme: { id?: string; config: import('./theme').ThemeConfig };
  version: string;
}