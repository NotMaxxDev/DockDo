import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, EyeOff, ListTodo } from 'lucide-react';
import { useStore } from '../store';
import { LIST_TYPE_INFO } from './listMeta';

export function ListsPage() {
  const { lists, tasksByList, hiddenLists, unhideList } = useStore();
  const navigate = useNavigate();
  const visibleLists = lists.filter((l) => !hiddenLists.includes(l.id));
  const hidden = lists.filter((l) => hiddenLists.includes(l.id));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-28">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Meine Listen</h1>
        <p className="text-sm text-muted">{visibleLists.length} Liste{visibleLists.length === 1 ? '' : 'n'}</p>
      </header>

      {visibleLists.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          {lists.length === 0
            ? 'Noch keine Listen. Ein Administrator weist dir Listen zu – sie erscheinen dann hier.'
            : 'Alle Listen sind ausgeblendet.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleLists.map((l) => {
            const tasks = tasksByList[l.id] || [];
            const done = tasks.filter((t) => t.status === 'done').length;
            const open = tasks.length - done;
            const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
            const type = l.type ? LIST_TYPE_INFO[l.type] : undefined;
            return (
              <button
                key={l.id}
                onClick={() => navigate(`/list/${l.id}`)}
                style={{ borderColor: l.color || type?.color || 'rgb(var(--c-primary))' }}
                className="card group flex flex-col gap-3 p-4 text-left transition-shadow hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-theme text-lg"
                    style={{ background: l.color || type?.color || 'rgb(var(--c-primary))', color: '#fff' }}
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
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: l.color || type?.color || 'rgb(var(--c-primary))' }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {hidden.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-bold">Ausgeblendete Listen</h2>
            <span className="text-xs text-muted">{hidden.length}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {hidden.map((l) => {
              const type = l.type ? LIST_TYPE_INFO[l.type] : undefined;
              return (
                <div key={l.id} className="card flex items-center gap-3 p-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme text-base opacity-60"
                    style={{ background: l.color || type?.color || 'rgb(var(--c-primary))', color: '#fff' }}
                  >
                    {type?.icon || <ListTodo className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <div className="text-xs text-muted">{type ? type.label : 'Liste'}</div>
                  </div>
                  <button
                    className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                    onClick={() => unhideList(l.id)}
                    title="Liste wieder anzeigen"
                  >
                    Einblenden
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
