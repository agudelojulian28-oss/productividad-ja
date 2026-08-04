'use client';

import { useState } from 'react';
import { BarList, type BarItem } from './bar-list';

// Estadística Ingresos/Gastos con toggle (inspirado en la referencia móvil).
// Móvil: una vista a la vez (cifra grande + barras). Escritorio: el CSS muestra
// ambas y oculta el toggle (hay espacio). Datos ya calculados en el servidor.
export function FinStats({
  inflowLabel,
  outflowLabel,
  fuentes,
  gastos,
}: {
  inflowLabel: string;
  outflowLabel: string;
  fuentes: BarItem[];
  gastos: BarItem[];
}) {
  const [tab, setTab] = useState<'in' | 'out'>('in');

  return (
    <section className="fin-block fin-stats">
      <div className="seg fin-stats-seg">
        <button
          type="button"
          className={`seg-btn${tab === 'in' ? ' seg-on' : ''}`}
          onClick={() => setTab('in')}
        >
          Ingresos
        </button>
        <button
          type="button"
          className={`seg-btn${tab === 'out' ? ' seg-on' : ''}`}
          onClick={() => setTab('out')}
        >
          Gastos
        </button>
      </div>

      <div className={`fin-stats-pane${tab === 'in' ? ' on' : ''}`}>
        <div className="fin-stats-head">
          <span className="fin-stats-k">Entró este mes</span>
          <span className="fin-stats-num fin-pos">{inflowLabel}</span>
        </div>
        {fuentes.length === 0 ? (
          <p className="muted">Sin ingresos por proyecto este mes.</p>
        ) : (
          <BarList items={fuentes} tone="accent" />
        )}
      </div>

      <div className={`fin-stats-pane${tab === 'out' ? ' on' : ''}`}>
        <div className="fin-stats-head">
          <span className="fin-stats-k">Salió este mes</span>
          <span className="fin-stats-num fin-neg">{outflowLabel}</span>
        </div>
        {gastos.length === 0 ? (
          <p className="muted">Sin gastos registrados este mes.</p>
        ) : (
          <BarList items={gastos} tone="muted" />
        )}
      </div>
    </section>
  );
}
