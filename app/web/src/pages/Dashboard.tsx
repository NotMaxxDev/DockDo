import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Flag, ChevronRight, ListTodo } from 'lucide-react';
import { useStore } from '../store';
import type { TaskDto } from '../types';
import { LIST_TYPE_INFO } from './listMeta';

interface AggTask extends TaskDto {
  listName: string;
  listColor: string | null;
}

export function DashboardPage() {
  const { lists, tasksByList, user } = useStore();
  const navigate = useNavigate();

  const myTasks: AggTask[] = lists
    .flatMap((l) => (tasksByList[l.id] || []).map((t) => ({ ...t, listName: l.name, listColor: l.color })))
    .filter((t) => t.assigneeId === user?.id && (t.status === 'todo' || t.status === 'in_progress'))
    .sort((a, b) => ((a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1));

  const overdue = myTasks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < Date.now());
  const openCount = myTasks.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Guten Tag, {user?.name?.split(' ')[0] || 'willkommen'}</h1>
        <p className="text-sm text-muted">{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </header>

      {overdue.length > 0 && (
        <section className="card mb-5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger">
            <Flag className="h-4 w-4" /> {overdue.length} überfällige Aufgabe{overdue.length > 1 ? 'n' : ''}
          </div>
          <ul className="space-y-1.5">
            {overdue.slice(0, 5).map((t) => (
              <li key={t.id}>
                <button
                  className="flex w-full items-center gap-2 rounded-theme px-2 py-1.5 text-left text-sm transition-colors hover:bg-bg"
                  onClick={() => navigate(`/list/${t.listId}`)}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.listColor || 'var(--c-primary)' }} />
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-danger">{new Date(t.dueDate!).toLocaleDateString('de-DE')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mb-5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Meine Aufgaben</h2>
          <span className="text-xs text-muted">{openCount} offen</span>
        </div>
        {myTasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Dir sind keine offenen Aufgaben zugewiesen.</p>
        ) : (
          <ul className="space-y-1.5">
            {myTasks.slice(0, 8).map((t) => {
              const isOverdue = t.dueDate && new Date(t.dueDate).getTime() < Date.now();
              return (
                <li key={t.id}>
                  <button
                    className="flex w-full items-center gap-2 rounded-theme px-2 py-1.5 text-left text-sm transition-colors hover:bg-bg"
                    onClick={() => navigate(`/list/${t.listId}`)}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.listColor || 'var(--c-primary)' }} />
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {t.priority !== 'medium' && (
                        <span className={`chip ${t.priority === 'high' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'}`}>
                          {t.priority === 'high' ? 'Hoch' : 'Niedrig'}
                        </span>
                      )}
                      {t.dueDate && (
                        <span className={`chip ${isOverdue ? 'bg-danger/10 text-danger' : 'bg-line/50 text-muted'}`}>
                          <Calendar className="h-3 w-3" /> {new Date(t.dueDate).toLocaleDateString('de-DE')}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold">Meine Listen</h2>
          <span className="text-xs text-muted">{lists.length}</span>
        </div>
        {lists.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">
            Noch keine Listen. Ein Administrator weist dir Listen zu – sie erscheinen dann hier.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {lists.map((l) => {
              const tasks = tasksByList[l.id] || [];
              const done = tasks.filter((t) => t.status === 'done').length;
              const open = tasks.length - done;
              const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
              const type = l.type ? LIST_TYPE_INFO[l.type] : undefined;
              return (
                <button
                  key={l.id}
                  onClick={() => navigate(`/list/${l.id}`)}
                  className="card group flex flex-col gap-3 p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-theme text-lg"
                      style={{ background: l.color || type?.color || 'var(--c-primary)', color: '#fff' }}
                    >
                      {type?.icon || <ListTodo className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{l.name}</div>
                      <div className="text-xs text-muted">
                        {type ? type.label : 'Liste'} · {open} offen, {done} erledigt
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: l.color || type?.color || 'var(--c-primary)' }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}