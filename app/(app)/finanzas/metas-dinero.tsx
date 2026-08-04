'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createMoneyGoalAction } from '@/app/actions/finance';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { money } from '@/lib/format';

type Project = { id: string; title: string };
export type MetaProgreso = {
  goalId: string;
  title: string;
  metric: 'money_in' | 'money_net';
  targetValue: number; // pesos
  currentValue: number; // pesos
  periodEnd: string;
};

function firstOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}
function lastOfMonth(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${ymd.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function MetasDinero({
  projects,
  metas,
  today,
}: {
  projects: Project[];
  metas: MetaProgreso[];
  today: string;
}) {
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<'money_in' | 'money_net'>('money_in');
  const [objetivo, setObjetivo] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [desde, setDesde] = useState(firstOfMonth(today));
  const [hasta, setHasta] = useState(lastOfMonth(today));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const t = title.trim();
    const minor = parseAmountToMinor(objetivo);
    if (!t) return setError('Ponle un nombre a la meta');
    if (!minor) return setError('Objetivo inválido');
    if (!projectId) return setError('Elige un proyecto');
    startTransition(async () => {
      const res = await createMoneyGoalAction({
        title: t,
        metric,
        targetValue: minor / 100, // pesos
        projectId,
        periodStart: desde,
        periodEnd: hasta,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else {
        setTitle('');
        setObjetivo('');
      }
    });
  }

  return (
    <div>
      {metas.length > 0 && (
        <ul className="fin-list" style={{ marginBottom: 16 }}>
          {metas.map((m) => {
            const pct =
              m.targetValue > 0
                ? Math.min(100, Math.round((m.currentValue / m.targetValue) * 100))
                : 0;
            const vencida = m.periodEnd < today && pct < 100;
            return (
              <li key={m.goalId} className="meta-money">
                <div className="meta-money-head">
                  <span className="fin-row-name">{m.title}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {m.metric === 'money_in' ? 'ingresos' : 'neto'}
                  </span>
                </div>
                <div className="meta-bar">
                  <div
                    className={`meta-bar-fill${pct >= 100 ? ' meta-done' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="meta-money-foot">
                  <span className="fin-row-amt">
                    {money(m.currentValue * 100, { compact: true })} /{' '}
                    {money(m.targetValue * 100, { compact: true })}
                  </span>
                  <span className={vencida ? 'overdue' : 'muted'} style={{ fontSize: 12 }}>
                    {pct}% · vence {m.periodEnd}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={onSubmit} className="fin-form">
        <input
          type="text"
          placeholder="Nombre de la meta (ej. Ingresos de julio)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="field"
          aria-label="Nombre de la meta"
          autoComplete="off"
        />
        <div className="new-task-row">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as 'money_in' | 'money_net')}
            className="field"
            aria-label="Métrica"
          >
            <option value="money_in">Ingresos</option>
            <option value="money_net">Neto (ingresos − gastos)</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Objetivo en COP"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            className="field"
            aria-label="Objetivo en pesos"
            autoComplete="off"
          />
        </div>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="field"
          aria-label="Proyecto de la meta"
        >
          {projects.length === 0 && <option value="">Crea un proyecto primero</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <div className="new-task-row">
          <label className="cal-field-label" style={{ flex: 1 }}>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field" />
          </label>
          <label className="cal-field-label" style={{ flex: 1 }}>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field" />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Crear meta de dinero'}
        </button>
      </form>
    </div>
  );
}
