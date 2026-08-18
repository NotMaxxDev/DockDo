import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
  type DragStartEvent, type DragOverEvent, type DragEndEvent
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Flag, Tag, Search, ListTodo } from 'lucide-react';
import { api } from '../api';
import { wsClient } from '../ws';
import { useStore } from '../store';
import type { TaskDto } from '../types';
import { TaskDetail, Modal } from './Board';

interface BoardList {
  id: string;
  name: string;
  color: string | null;
  memberRole: 'owner' | 'editor' | 'viewer';
}

interface Assignee {
  id: string;
  name: string;
}

type ColumnStatus = 'todo' | 'in_progress' | 'deferred' | 'done';

const COLUMNS: { id: ColumnStatus; title: string; hint: string; color: string }[] = [
  { id: 'todo', title: 'Aufgabenpool', hint: 'Noch keinem Status zugeordnet', color: 'var(--c-primary)' },
  { id: 'in_progress', title: 'In Bearbeitung', hint: 'Aktuell laufend', color: 'var(--c-accent)' },
  { id: 'deferred', title: 'Verschoben / Frist gesetzt', hint: 'Zurückgestellt oder neue Frist', color: 'var(--c-warning)' },
  { id: 'done', title: 'Erledigt', hint: 'Abgeschlossen', color: 'var(--c-success)' }
];

export function KanbanPage() {
  const { user, updateTask, deleteTask } = useStore();
  const [lists, setLists] = useState<BoardList[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [query, setQuery] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected] = useState<TaskDto | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<{ userId: string; name: string; email: string; role: string }[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [pendingDeferred, setPendingDeferred] = useState<{ task: TaskDto; from: ColumnStatus } | null>(null);
  const [dueValue, setDueValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dragStartRef = useRef<{ id: string; from: ColumnStatus } | null>(null);

  interface BoardTask extends TaskDto {
    listName: string;
    listColor: string | null;
  }

  const [boardTasks, setBoardTasks] = useState<BoardTask[]>([]);

  const load = async () => {
    try {
      const data = await api<{ lists: BoardList[]; assignees: Assignee[]; tasks: TaskDto[] }>('/api/board');
      setLists(data.lists || []);
      setAssignees(data.assignees || []);
      const byId = new Map((data.lists || []).map((l) => [l.id, l]));
      setBoardTasks((data.tasks || []).map((t) => ({
        ...t,
        listName: byId.get(t.listId)?.name || '',
        listColor: byId.get(t.listId)?.color || null
      })));
      for (const l of data.lists || []) wsClient.subscribe(l.id);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const offs = [
      wsClient.on('task:updated', () => void load()),
      wsClient.on('task:created', () => void load()),
      wsClient.on('task:deleted', () => void load()),
      wsClient.on('task:comment', () => void load())
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);

  const filtered = useMemo(() => {
    let out = boardTasks.filter((t) => t.status !== 'cancelled');
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (listFilter) out = out.filter((t) => t.listId === listFilter);
    if (assigneeFilter === 'me') out = out.filter((t) => t.assigneeId === user?.id);
    else if (assigneeFilter) out = out.filter((t) => t.assigneeId === assigneeFilter);
    if (priorityFilter) out = out.filter((t) => t.priority === priorityFilter);
    return out.sort((a, b) => {
      const aDue = a.dueDate || '9999-12-31';
      const bDue = b.dueDate || '9999-12-31';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }, [boardTasks, query, listFilter, assigneeFilter, priorityFilter, user]);

  const columns = useMemo(() => {
    const map: Record<ColumnStatus, BoardTask[]> = { todo: [], in_progress: [], deferred: [], done: [] };
    for (const t of filtered) if (map[t.status as ColumnStatus]) map[t.status as ColumnStatus].push(t);
    return map;
  }, [filtered]);

  const findColumn = (id: string): ColumnStatus | null => {
    if ((COLUMNS as { id: string }[]).some((c) => c.id === id)) return id as ColumnStatus;
    const t = boardTasks.find((x) => x.id === id);
    return t ? (t.status as ColumnStatus) : null;
  };

  const moveTaskLocally = (taskId: string, status: ColumnStatus) => {
    setBoardTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  };

  const handleDragStart = (e: DragStartEvent) => {
    const from = findColumn(String(e.active.id));
    dragStartRef.current = { id: String(e.active.id), from: from || 'todo' };
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const activeCol = findColumn(activeId);
    const overCol = findColumn(overId);
    if (!activeCol || !overCol || activeCol === overCol) return;
    moveTaskLocally(activeId, overCol);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const from = dragStartRef.current?.from || findColumn(activeId);
    dragStartRef.current = null;
    const overCol = findColumn(String(over.id));
    if (!from || !overCol || from === overCol) return;
    const task = boardTasks.find((t) => t.id === activeId);
    if (!task) return;
    if (overCol === 'deferred') {
      const initial = task.dueDate ? task.dueDate.slice(0, 16) : '';
      setDueValue(initial);
      setPendingDeferred({ task: { ...task, status: 'deferred' }, from });
      return;
    }
    await persistStatus(task, overCol);
  };

  const persistStatus = async (task: TaskDto, status: ColumnStatus) => {
    try {
      await updateTask(task.id, { status });
    } catch {
      await load();
    }
  };

  const confirmDeferred = async () => {
    if (!pendingDeferred) return;
    const { task } = pendingDeferred;
    setBusy(true);
    try {
      const dueDate = dueValue ? new Date(dueValue).toISOString() : null;
      await updateTask(task.id, { status: 'deferred', dueDate });
      setPendingDeferred(null);
    } catch {
      moveTaskLocally(task.id, pendingDeferred.from);
      setPendingDeferred(null);
    } finally {
      setBusy(false);
    }
  };

  const cancelDeferred = () => {
    if (pendingDeferred) moveTaskLocally(pendingDeferred.task.id, pendingDeferred.from);
    setPendingDeferred(null);
  };

  const openTask = async (task: TaskDto) => {
    setSelected(task);
    try {
      const d = await api<{ members: typeof selectedMembers; labels: typeof selectedLabels }>(`/api/lists/${task.listId}`);
      setSelectedMembers(d.members || []);
      setSelectedLabels(d.labels || []);
    } catch {
      setSelectedMembers([]);
      setSelectedLabels([]);
    }
  };

  const deleteCurrent = async () => {
    if (!selected) return;
    await deleteTask(selected.id);
    setSelected(null);
  };

  const canEditTask = (task: TaskDto) => listById.get(task.listId)?.memberRole !== 'viewer';

  return (
    <div className="mx-auto px-4 py-6 pb-24">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Board</h1>
        <span className="text-sm text-muted">Alle Aufgaben aus deinen Listen</span>
      </header>

      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Suchen…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input" value={listFilter} onChange={(e) => setListFilter(e.target.value)}>
          <option value="">Alle Listen</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="input" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="">Alle Personen</option>
          <option value="me">Mir zugewiesen</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="input" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">Alle Prioritäten</option>
          <option value="low">Niedrig</option>
          <option value="medium">Mittel</option>
          <option value="high">Hoch</option>
        </select>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-sm text-muted">Lade Board…</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={(e) => void handleDragEnd(e)}>
          <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                col={col}
                items={columns[col.id]}
                onOpen={(t) => void openTask(t)}
                onToggleDone={(t) => void persistStatus(t, t.status === 'done' ? 'todo' : 'done')}
              />
            ))}
          </div>
        </DndContext>
      )}

      {selected && (
        <TaskDetail
          task={selected}
          canEdit={canEditTask(selected)}
          members={selectedMembers}
          labels={selectedLabels}
          onClose={() => setSelected(null)}
          onChanged={load}
          onDelete={deleteCurrent}
          onToggleSub={(sub, done) => api(`/api/subtasks/${sub}`, { method: 'PATCH', body: { done } })}
        />
      )}

      {pendingDeferred && (
        <Modal title="Frist setzen" onClose={cancelDeferred}>
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Die Aufgabe <span className="font-semibold text-ink">{pendingDeferred.task.title}</span> wird nach „Verschoben / Frist gesetzt" verschoben. Wähle eine neue Frist:
            </p>
            <input className="input" type="datetime-local" value={dueValue} onChange={(e) => setDueValue(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-quiet" onClick={cancelDeferred}>Abbrechen</button>
              <button className="btn-primary" onClick={() => void confirmDeferred()} disabled={busy}>{busy ? 'Wird verschoben…' : 'Verschieben'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Column({ col, items, onOpen, onToggleDone }: {
  col: { id: ColumnStatus; title: string; hint: string; color: string };
  items: TaskDto[];
  onOpen: (t: TaskDto) => void;
  onToggleDone: (t: TaskDto) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-[min(92vw,320px)] shrink-0 flex-col rounded-theme border border-line bg-surface/60 transition-colors lg:w-auto lg:shrink ${isOver ? 'ring-2 ring-[var(--c-primary)]/40' : ''}`}
      style={{ minHeight: 160 }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.color }} />
        <h2 className="truncate text-sm font-bold">{col.title}</h2>
        <span className="ml-auto shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-muted">{items.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="rounded-theme border border-dashed border-line p-4 text-center text-xs text-muted">{col.hint}</div>
        ) : (
          items.map((t) => (
            <KanbanCard key={t.id} task={t} onOpen={() => onOpen(t)} onToggleDone={() => onToggleDone(t)} />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({ task, onOpen, onToggleDone }: { task: TaskDto & { listName: string; listColor: string | null }; onOpen: () => void; onToggleDone: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: { status: task.status } });
  const overdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate).getTime() < Date.now();
  const today = task.dueDate && task.status !== 'done' && new Date(task.dueDate).toDateString() === new Date().toDateString();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
      className={`card group cursor-pointer select-none p-3 ${task.status === 'done' ? 'opacity-60' : ''}`}
      onClick={onOpen}
    >
      <div {...attributes} {...listeners} className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: task.listColor || 'var(--c-primary)' }} />
        <span className="truncate">{task.listName}</span>
      </div>
      <div className={`truncate text-sm font-medium ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.priority !== 'medium' && (
          <span className={`chip ${task.priority === 'high' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'}`}>
            <Flag className="h-3 w-3" /> {task.priority === 'high' ? 'Hoch' : 'Niedrig'}
          </span>
        )}
        {task.dueDate && (
          <span className={`chip ${overdue ? 'bg-danger/10 text-danger' : today ? 'bg-warn/10 text-warn' : 'bg-line/50 text-muted'}`}>
            <Calendar className="h-3 w-3" /> {new Date(task.dueDate).toLocaleDateString('de-DE')} {overdue ? '· überfällig' : ''}
          </span>
        )}
        {task.labels.slice(0, 2).map((l) => (
          <span key={l.id} className="chip text-white" style={{ background: l.color }}>
            <Tag className="h-3 w-3" /> {l.name}
          </span>
        ))}
        {task.subtasks.length > 0 && (
          <span className="chip bg-bg text-muted">
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
          </span>
        )}
        {task.status !== 'done' && (
          <button
            className="ml-auto rounded-theme p-1 text-muted transition-colors hover:bg-line hover:text-ink"
            title="Als erledigt markieren"
            onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
          >
            <ListTodo className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
