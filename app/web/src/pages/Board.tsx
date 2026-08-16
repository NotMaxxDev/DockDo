import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, Calendar, Tag, Flag, ChevronDown, Search, X } from 'lucide-react';
import { useStore } from '../store';
import type { TaskDto } from '../types';
import { api } from '../api';

export function BoardPage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { lists, tasksByList, refreshTasks, presence, user, updateTask, deleteTask, createTask, reorderTasks, setActiveList, deleteList } = useStore();
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selected, setSelected] = useState<TaskDto | null>(null);
  const [members, setMembers] = useState<{ userId: string; name: string; email: string; role: string }[]>([]);
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const list = lists.find((l) => l.id === listId);
  const tasks = useMemo(() => (listId ? tasksByList[listId] || [] : []), [tasksByList, listId]);
  const canEdit = !!list && list.memberRole !== 'viewer';

  useEffect(() => {
    setActiveList(listId || null);
    if (listId) {
      void refreshTasks(listId);
      void api<{ members: typeof members; labels: typeof labels }>(`/api/lists/${listId}`).then((d) => {
        setMembers(d.members || []);
        setLabels(d.labels || []);
      }).catch(() => undefined);
    }
    return () => setActiveList(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  useEffect(() => {
    if (!list && lists.length > 0 && listId) {
      const exists = lists.some((l) => l.id === listId);
      if (!exists) navigate('/', { replace: true });
    }
  }, [list, lists, listId, navigate]);

  const filtered = useMemo(() => {
    let out = [...tasks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (statusFilter !== 'all') out = out.filter((t) => t.status === statusFilter);
    if (labelFilter) out = out.filter((t) => t.labels.some((l) => l.id === labelFilter));
    if (assigneeFilter === 'me') out = out.filter((t) => t.assigneeId === user?.id);
    else if (assigneeFilter) out = out.filter((t) => t.assigneeId === assigneeFilter);
    return out;
  }, [tasks, statusFilter, labelFilter, assigneeFilter, user]);

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !listId) return;
    await createTask(listId, { title: newTaskTitle.trim() });
    setNewTaskTitle('');
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!listId) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = filtered.map((t) => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    const next = arrayMove(ids, oldIndex, newIndex);
    await reorderTasks(listId, next);
  };

  const toggleDone = async (t: TaskDto) => {
    await updateTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' });
  };

  const deleteCurrent = async () => {
    if (!selected) return;
    await deleteTask(selected.id);
    setSelected(null);
    setConfirmDelete(false);
  };

  if (!list) return <Navigate to="/" replace />;

  const activePresence = presence[list.id] || [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{list.name}</h1>
        {activePresence.length > 0 && (
          <span className="chip bg-primary/10 text-primary">
            {activePresence.filter((p) => p.userId !== user?.id).map((p) => p.name).join(', ') || 'Du'} gerade hier
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button className={`btn-quiet ${filterOpen ? 'border-primary text-primary' : ''}`} onClick={() => setFilterOpen((v) => !v)}>
            <Search className="h-4 w-4" /> Filter
          </button>
          {canEdit && (
            <button className="btn-danger btn-quiet !text-danger" onClick={() => setConfirmDelete(true)} title="Liste löschen">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {filterOpen && (
        <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Alle</option>
              <option value="todo">Offen</option>
              <option value="in_progress">In Arbeit</option>
              <option value="done">Erledigt</option>
              <option value="cancelled">Abgebrochen</option>
            </select>
          </div>
          <div>
            <label className="label">Label</label>
            <select className="input" value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
              <option value="">Alle</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Person</label>
            <select className="input" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">Alle</option>
              <option value="me">Mir zugewiesen</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {canEdit && (
        <form onSubmit={submitNew} className="mb-5 flex gap-2">
          <input className="input" placeholder="Neue Aufgabe – Enter zum Anlegen" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
          <button className="btn-primary shrink-0" type="submit"><Plus className="h-4 w-4" /> Hinzufügen</button>
        </form>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={filtered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {filtered.map((t) => (
              <TaskRow key={t.id} task={t} canEdit={canEdit} onOpen={() => setSelected(t)} onToggle={() => void toggleDone(t)} />
            ))}
            {filtered.length === 0 && (
              <div className="card p-8 text-center text-sm text-muted">Keine Aufgaben gefunden.</div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {selected && (
        <TaskDetail
          task={selected}
          canEdit={canEdit}
          members={members}
          labels={labels}
          onClose={() => setSelected(null)}
          onChanged={async () => listId && refreshTasks(listId)}
          onDelete={deleteCurrent}
          onToggleSub={(sub, done) => void api(`/api/subtasks/${sub}`, { method: 'PATCH', body: { done } })}
        />
      )}

      {confirmDelete && (
        <Modal title="Liste löschen?" onClose={() => setConfirmDelete(false)}>
          <p className="mb-4 text-sm text-muted">Die Liste „{list.name}“ und alle Aufgaben werden unwiderruflich gelöscht.</p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
            <button className="btn-danger" onClick={async () => { await deleteList(list.id); navigate('/'); }}>Löschen</button>
          </div>
        </Modal>
      )}
      {listId && listId.length > 0 && <span className="hidden">{list.memberRole}</span>}
    </div>
  );
}

function TaskRow({ task, canEdit, onOpen, onToggle }: { task: TaskDto; canEdit: boolean; onOpen: () => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  const overdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate).getTime() < Date.now();
  const today = task.dueDate && task.status !== 'done' && new Date(task.dueDate).toDateString() === new Date().toDateString();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`card group flex cursor-pointer items-center gap-3 p-3 ${task.status === 'done' ? 'opacity-60' : ''}`}
      onClick={() => { if (!isDragging) onOpen(); }}
    >
      <input
        type="checkbox"
        checked={task.status === 'done'}
        onChange={onToggle}
        disabled={!canEdit}
        className="h-4 w-4 accent-[var(--c-primary)]"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
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
          {task.labels.map((l) => (
            <span key={l.id} className="chip text-white" style={{ background: l.color }}>
              <Tag className="h-3 w-3" /> {l.name}
            </span>
          ))}
          {task.subtasks.length > 0 && (
            <span className="text-xs text-muted">
              {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
            </span>
          )}
          {task.assigneeId && task.assigneeId.length > 0 && (
            <span className="hidden h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white md:flex" title="Zugewiesen">
              {task.assigneeId.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <span
          {...attributes}
          {...listeners}
          className="hidden cursor-grab text-muted opacity-0 transition-opacity group-hover:opacity-100 md:block"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
      )}
    </div>
  );
}

function TaskDetail({ task, canEdit, members, labels, onClose, onChanged, onDelete, onToggleSub }: {
  task: TaskDto;
  canEdit: boolean;
  members: { userId: string; name: string; email: string; role: string }[];
  labels: { id: string; name: string; color: string }[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleSub: (subId: string, done: boolean) => Promise<void>;
}) {
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description);
  const [dueDate, setDueDate] = React.useState(task.dueDate ? task.dueDate.slice(0, 16) : '');
  const [priority, setPriority] = React.useState(task.priority);
  const [status, setStatus] = React.useState(task.status);
  const [assignee, setAssignee] = React.useState(task.assigneeId || '');
  const [labelIds, setLabelIds] = React.useState<string[]>(task.labels.map((l) => l.id));
  const [recurrence, setRecurrence] = React.useState(task.recurrence as { freq: string } | null);
  const [subTitle, setSubTitle] = React.useState('');
  const [comments, setComments] = React.useState<{ id: string; content: string; createdAt: string; user: { id: string; name: string } }[]>([]);
  const [commentDraft, setCommentDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { user } = useStore();

  React.useEffect(() => {
    void api<typeof comments>(`/api/tasks/${task.id}/comments`).then(setComments).catch(() => undefined);
  }, [task.id]);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: {
          title: title.trim(),
          description,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          priority,
          status,
          assigneeId: assignee || null,
          recurrence,
          labelIds
        }
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const addSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTitle.trim()) return;
    await api(`/api/tasks/${task.id}/subtasks`, { method: 'POST', body: { title: subTitle.trim() } });
    setSubTitle('');
    await onChanged();
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    await api(`/api/tasks/${task.id}/comments`, { method: 'POST', body: { content: commentDraft.trim() } });
    setCommentDraft('');
    const rows = await api<typeof comments>(`/api/tasks/${task.id}/comments`);
    setComments(rows);
  };

  return (
    <Modal title="" onClose={onClose} wide>
      <div className="space-y-4">
        <input className="input pr-10 text-lg font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={!canEdit}>
              <option value="todo">Offen</option>
              <option value="in_progress">In Arbeit</option>
              <option value="done">Erledigt</option>
              <option value="cancelled">Abgebrochen</option>
            </select>
          </div>
          <div>
            <label className="label">Priorität</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} disabled={!canEdit}>
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
            </select>
          </div>
          <div>
            <label className="label">Fällig am</label>
            <input className="input" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <label className="label">Zugewiesen an</label>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canEdit}>
              <option value="">Niemand</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Wiederholung</label>
            <select
              className="input"
              value={recurrence?.freq || 'none'}
              onChange={(e) => {
                const v = e.target.value;
                setRecurrence(v === 'none' ? null : { freq: v as 'daily' | 'weekly' | 'monthly' | 'custom', interval: 1 });
              }}
              disabled={!canEdit}
            >
              <option value="none">Keine</option>
              <option value="daily">Täglich</option>
              <option value="weekly">Wöchentlich</option>
              <option value="monthly">Monatlich</option>
              <option value="custom">Benutzerdefiniert</option>
            </select>
          </div>
          <div>
            <label className="label">Labels</label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setLabelIds((prev) => prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id])}
                  className={`chip transition-opacity ${labelIds.includes(l.id) ? 'text-white' : 'bg-line text-muted'}`}
                  style={labelIds.includes(l.id) ? { background: l.color } : undefined}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="label">Beschreibung</label>
          <textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} placeholder="Details zur Aufgabe…" />
        </div>

        {canEdit && <button className="btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Speichern…' : 'Speichern'}</button>}

        <div>
          <h4 className="label">Teilaufgaben</h4>
          <div className="space-y-1.5">
            {task.subtasks.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.done} disabled={!canEdit} onChange={() => onToggleSub(s.id, !s.done)} className="h-4 w-4 accent-[var(--c-primary)]" />
                <span className={s.done ? 'line-through text-muted' : ''}>{s.title}</span>
              </label>
            ))}
          </div>
          {canEdit && (
            <form onSubmit={addSub} className="mt-2 flex gap-2">
              <input className="input" placeholder="Teilaufgabe hinzufügen" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} />
              <button className="btn-ghost shrink-0" type="submit"><Plus className="h-4 w-4" /></button>
            </form>
          )}
        </div>

        <div>
          <h4 className="label">Kommentare</h4>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="rounded-theme bg-bg p-2">
                <div className="mb-0.5 flex items-center gap-2 text-xs">
                  <span className="font-semibold">{c.user.name}</span>
                  <span className="text-muted">{c.user.id === user?.id ? 'Du' : ''}</span>
                  <span className="ml-auto text-muted">{new Date(c.createdAt).toLocaleString('de-DE')}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
          </div>
          <form onSubmit={addComment} className="mt-2 flex gap-2">
            <input className="input" placeholder="Kommentar schreiben…" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} />
            <button className="btn-ghost shrink-0" type="submit">Senden</button>
          </form>
        </div>

        {canEdit && (
          <div className="flex justify-end border-t border-line pt-3">
            <button className="btn-danger" onClick={() => void onDelete()}>
              <Trash2 className="h-4 w-4" /> Aufgabe löschen
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function Modal({ title, children, onClose, wide }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-theme bg-surface p-5 sm:rounded-theme ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-line hover:text-ink"
          title="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
        {title && <h2 className="mb-4 pr-10 text-lg font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}