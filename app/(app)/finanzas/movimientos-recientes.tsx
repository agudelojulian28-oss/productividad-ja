'use client';

import { useState } from 'react';
import { money } from '@/lib/format';

export type MovRow = {
  id: string;
  direction: 'in' | 'out';
  baseAmountMinor: number;
  occurredOn: string;
  title: string; // descripción, o categoría, o "Ingreso/Gasto"
  areaName: string;
  receiptUrl: string | null;
};

type Filter = 'all' | 'in' | 'out';

// Lista de movimientos recientes con su descripción y comprobante (referencia:
// "Transaction History"). Filtro de vista Todos/Ingresos/Gastos (client-side).
export function MovimientosRecientes({ rows }: { rows: MovRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  if (rows.length === 0) {
    return <p className="muted">Aún no hay movimientos registrados.</p>;
  }

  const shown = filter === 'all' ? rows : rows.filter((r) => r.direction === filter);

  return (
    <div className="mov-wrap">
      <div className="seg mov-seg" role="tablist" aria-label="Filtrar movimientos">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`seg-btn${filter === 'all' ? ' seg-on' : ''}`}
          onClick={() => setFilter('all')}
        >
          Todos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'in'}
          className={`seg-btn${filter === 'in' ? ' seg-on' : ''}`}
          onClick={() => setFilter('in')}
        >
          Ingresos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'out'}
          className={`seg-btn${filter === 'out' ? ' seg-on' : ''}`}
          onClick={() => setFilter('out')}
        >
          Gastos
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="muted">Sin {filter === 'in' ? 'ingresos' : 'gastos'} recientes.</p>
      ) : (
        <div className="mov-list">
          {shown.map((m) => (
            <div key={m.id} className="mov-row">
              {m.receiptUrl ? (
                <a
                  className="mov-thumb"
                  href={m.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ver comprobante"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.receiptUrl} alt="comprobante" />
                </a>
              ) : (
                <div className="mov-thumb">
                  <span className="mov-thumb-empty" aria-hidden="true">
                    {m.direction === 'in' ? '↘' : '↗'}
                  </span>
                </div>
              )}
              <div className="mov-body">
                <span className="mov-title">{m.title}</span>
                <span className="mov-meta">
                  {m.areaName} · {m.occurredOn}
                  {m.receiptUrl ? ' · 📎 comprobante' : ''}
                </span>
              </div>
              <span className={`mov-amt ${m.direction === 'in' ? 'fin-pos' : 'fin-neg'}`}>
                {m.direction === 'in' ? '+' : '−'}
                {money(m.baseAmountMinor, { compact: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
