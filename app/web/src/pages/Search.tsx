import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

interface Hit {
  id: string;
  title: string;
  listId: string;
  status: string;
  dueDate: string | null;
}

export function SearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const [hits, setHits] = useState<Hit[] | null>(null);

  useEffect(() => {
    if (!q) {
      setHits([]);
      return;
    }
    void api<{ tasks: Hit[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((d) => setHits(d.tasks || [])).catch(() => setHits([]));
  }, [q]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Suche: „{q}“</h1>
      {hits === null && <div className="text-sm text-muted">Suche läuft…</div>}
      {hits !== null && hits.length === 0 && <div className="text-sm text-muted">Keine Aufgaben gefunden.</div>}
      <div className="space-y-2">
        {hits?.map((h) => (
          <button key={h.id} className="card w-full p-3 text-left hover:border-primary/50" onClick={() => navigate(`/list/${h.listId}`)}>
            <div className="text-sm font-medium">{h.title}</div>
            <div className="mt-0.5 text-xs text-muted">
              {h.status === 'done' ? 'Erledigt' : h.status === 'in_progress' ? 'In Arbeit' : 'Offen'}
              {h.dueDate && ` · fällig ${new Date(h.dueDate).toLocaleDateString('de-DE')}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}