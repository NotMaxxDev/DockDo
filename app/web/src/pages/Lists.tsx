import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ListTodo } from 'lucide-react';
import { useStore } from '../store';
import { LIST_TYPE_INFO } from './listMeta';

export function ListsPage() {
  const { lists, tasksByList } = useStore();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-28">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Meine Listen</h1>
        <p className="text-sm text-muted">{lists.length} Liste{lists.length === 1 ? '' : 'n'}</p>
      </header>

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
    </div>
  );
}