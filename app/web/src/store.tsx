import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setCsrf } from './api';
import { applyTheme, type ThemeConfig } from './theme';
import { wsClient } from './ws';
import { saveSnapshot, loadSnapshot, onNetworkChange } from './offline';
import type { Meta, UserDto, ListDto, TaskDto, ThemeMeta } from './types';

interface StoreState {
  meta: Meta | null;
  user: UserDto | null;
  csrf: string;
  lists: ListDto[];
  tasksByList: Record<string, TaskDto[]>;
  activeListId: string | null;
  presence: Record<string, { userId: string; name: string }[]>;
  online: boolean;
  loading: boolean;
  bootstrapped: boolean;
  login: (email: string, password: string) => Promise<{ needTotp: boolean; totpToken?: string }>;
  completeTotp: (totpToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshLists: () => Promise<void>;
  refreshTasks: (listId: string) => Promise<void>;
  updateList: (id: string, patch: Partial<ListDto>) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  createTask: (listId: string, data: Partial<TaskDto>) => Promise<TaskDto>;
  updateTask: (id: string, patch: Record<string, unknown>) => Promise<TaskDto | null>;
  deleteTask: (id: string) => Promise<void>;
  reorderTasks: (listId: string, taskIds: string[]) => Promise<void>;
  setActiveList: (id: string | null) => void;
  selectTheme: (themeId: string) => Promise<void>;
  updateUserLocally: (user: UserDto) => void;
}

const Ctx = createContext<StoreState>(null as never);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [csrf, setCsrfState] = useState('');
  const [lists, setLists] = useState<ListDto[]>([]);
  const [tasksByList, setTasksByList] = useState<Record<string, TaskDto[]>>({});
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Record<string, { userId: string; name: string }[]>>({});
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const userRef = useRef<UserDto | null>(null);
  userRef.current = user;

  const applyUserTheme = useCallback((userDto: UserDto | null, themes: ThemeMeta[], defaultConfig: ThemeConfig | undefined) => {
    if (userDto?.themeId) {
      const t = themes.find((x) => x.id === userDto.themeId);
      if (t) {
        applyTheme(t.config);
        return;
      }
    }
    applyTheme(defaultConfig);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<{ user: UserDto; csrf: string }>('/api/auth/me');
      setUser(data.user);
      setCsrf(data.csrf);
      setCsrfState(data.csrf);
      const m = await api<Meta>('/api/meta');
      setMeta(m);
      applyUserTheme(data.user, m.themes, m.defaultTheme.config);
    } catch {
      setUser(null);
    }
  }, [applyUserTheme]);

  const refreshLists = useCallback(async () => {
    const rows = await api<ListDto[]>('/api/lists');
    setLists(rows);
    return rows;
  }, []);

  const refreshTasks = useCallback(async (listId: string) => {
    const data = await api<{ tasks: TaskDto[] }>(`/api/lists/${listId}/tasks`);
    if (data.tasks) setTasksByList((prev) => ({ ...prev, [listId]: data.tasks }));
  }, []);

  const boot = useCallback(async () => {
    try {
      const m = await api<Meta>('/api/meta');
      setMeta(m);
      try {
        const me = await api<{ user: UserDto; csrf: string }>('/api/auth/me');
        setUser(me.user);
        setCsrf(me.csrf);
        setCsrfState(me.csrf);
        applyUserTheme(me.user, m.themes, m.defaultTheme.config);
        const rows = await api<ListDto[]>('/api/lists');
        setLists(rows);
        for (const l of rows.slice(0, 20)) {
          wsClient.subscribe(l.id);
          void refreshTasks(l.id);
        }
        setBootstrapped(true);
        wsClient.connect();
      } catch {
        setUser(null);
      }
    } catch {
      /* server unreachable */
    } finally {
      setLoading(false);
    }
  }, [applyUserTheme, refreshTasks]);

  useEffect(() => {
    void boot();
    const off = onNetworkChange((o) => setOnline(o));
    wsClient.on('task:created', (d) => {
      const listId = String(d.listId);
      void refreshTasks(listId);
    });
    wsClient.on('task:updated', (d) => {
      const listId = String(d.listId);
      void refreshTasks(listId);
    });
    wsClient.on('task:deleted', (d) => {
      const listId = String(d.listId);
      setTasksByList((prev) => ({ ...prev, [listId]: (prev[listId] || []).filter((t) => t.id !== d.taskId) }));
    });
    wsClient.on('task:reordered', () => {
      /* full refresh arrives as task:updated */
    });
    wsClient.on('task:comment', (d) => {
      void refreshTasks(String(d.listId));
    });
    wsClient.on('presence', (d) => {
      const listId = String(d.listId);
      const usersArr = (d.users as { userId: string; name: string }[]) || [];
      setPresence((prev) => ({ ...prev, [listId]: usersArr }));
    });
    wsClient.on('list:deleted', (d) => {
      const listId = String(d.listId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      setTasksByList((prev) => {
        const next = { ...prev };
        delete next[listId];
        return next;
      });
    });
    wsClient.on('system:theme-changed', () => void refreshMe());
    return () => {
      off();
      wsClient.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    const t = setTimeout(() => {
      void saveSnapshot({ lists, tasksByList, savedAt: new Date().toISOString() });
    }, 400);
    return () => clearTimeout(t);
  }, [lists, tasksByList, bootstrapped]);

  useEffect(() => {
    if (online && !loading) void refreshLists().catch(() => undefined);
  }, [online, loading, refreshLists]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ needTotp: boolean; totpToken?: string; user?: UserDto }>('/api/auth/login', { method: 'POST', body: { email, password } });
    if (res.needTotp) return { needTotp: true, totpToken: res.totpToken };
    if (res.user) {
      setUser(res.user);
      await refreshMe();
    }
    return { needTotp: false };
  }, [refreshMe]);

  const completeTotp = useCallback(async (totpToken: string, code: string) => {
    await api('/api/auth/totp', { method: 'POST', body: { totpToken, code } });
    await refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setUser(null);
    setCsrf('');
    setCsrfState('');
    window.location.href = '/login';
  }, []);

  const updateList = useCallback(async (id: string, patch: Partial<ListDto>) => {
    await api(`/api/lists/${id}`, { method: 'PATCH', body: patch });
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const deleteList = useCallback(async (id: string) => {
    await api(`/api/lists/${id}`, { method: 'DELETE' });
    wsClient.unsubscribe(id);
    setLists((prev) => prev.filter((l) => l.id !== id));
    setTasksByList((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const createTask = useCallback(async (listId: string, data: Partial<TaskDto>) => {
    const row = await api<TaskDto>(`/api/lists/${listId}/tasks`, { method: 'POST', body: data });
    setTasksByList((prev) => ({ ...prev, [listId]: [...(prev[listId] || []), { ...row, labels: [], subtasks: [] }] }));
    return row;
  }, []);

  const updateTask = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const res = await api<{ ok: boolean; task: TaskDto }>(`/api/tasks/${id}`, { method: 'PATCH', body: patch });
    if (res?.task) {
      const listId = res.task.listId;
      setTasksByList((prev) => ({ ...prev, [listId]: (prev[listId] || []).map((t) => (t.id === id ? res.task : t)) }));
      return res.task;
    }
    return null;
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasksByList((prev) => {
      const next: Record<string, TaskDto[]> = {};
      for (const [k, v] of Object.entries(prev)) next[k] = v.filter((t) => t.id !== id);
      return next;
    });
  }, []);

  const reorderTasks = useCallback(async (listId: string, taskIds: string[]) => {
    await api(`/api/lists/${listId}/reorder`, { method: 'PUT', body: { taskIds } });
    setTasksByList((prev) => {
      const cur = prev[listId] || [];
      const map = new Map(cur.map((t) => [t.id, t]));
      const next = taskIds.map((id) => map.get(id)).filter(Boolean) as TaskDto[];
      return { ...prev, [listId]: next };
    });
  }, []);

  const selectTheme = useCallback(async (themeId: string) => {
    const res = await api<{ user: UserDto }>('/api/me/theme', { method: 'PUT', body: { themeId } });
    setUser(res.user);
    if (meta) applyUserTheme(res.user, meta.themes, meta.defaultTheme.config);
  }, [meta, applyUserTheme]);

  const updateUserLocally = useCallback((u: UserDto) => {
    setUser(u);
  }, []);

  const value = useMemo<StoreState>(() => ({
    meta, user, csrf, lists, tasksByList, activeListId, presence, online, loading, bootstrapped,
    login, completeTotp, logout, refreshMe, refreshLists, refreshTasks,
    updateList, deleteList, createTask, updateTask, deleteTask, reorderTasks,
    setActiveList: setActiveListId, selectTheme, updateUserLocally
  }), [meta, user, csrf, lists, tasksByList, activeListId, presence, online, loading, bootstrapped,
    login, completeTotp, logout, refreshMe, refreshLists, refreshTasks,
    updateList, deleteList, createTask, updateTask, deleteTask, reorderTasks, selectTheme, updateUserLocally]);

  useEffect(() => {
    if (!navigator.serviceWorker) return;
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  useEffect(() => {
    const persist = async () => {
      const snap = await loadSnapshot();
      if (snap && !navigator.onLine) {
        setLists((snap.lists as ListDto[]) || []);
        setTasksByList((snap.tasksByList as Record<string, TaskDto[]>) || {});
      }
    };
    if (!bootstrapped) void persist();
  }, [bootstrapped]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}