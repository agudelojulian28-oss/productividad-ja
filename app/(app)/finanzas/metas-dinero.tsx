'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createMoneyGoalAction, updateMoneyGoalAction, deleteMoneyGoalAction } from '@/app/actions/finance';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { money } from '@/lib/format';
import { Modal } from '../modal';
import { SegSelect } from '../seg-select';
import { DateField } from '../date-picker';

type Project = { id: string; title: string };
export type MetaProgreso = {
  goalId: string;
  title: string;
  metric: 'money_in' | 'money_net';
  targetValue: number; // pesos
  currentValue: number; // pesos
  periodStart: string;
  periodEnd: string;
  projectId: string | null;
  projectTitle: string;
};

function firstOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}
function lastOfMonth(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${ymd.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}
/** Días desde epoch para un YMD (sin zona horaria: solo para restas de días). */
function dayNum(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MetaProgreso | null>(null);
  const [editing, setEditing] = useState(false);

  function closeDetail() {
    setDetail(null);
    setEditing(false);
  }

  return (
    <div>
      {metas.length > 0 ? (
        <ul className="fin-list" style={{ marginBottom: 14 }}>
          {metas.map((m) => {
            const pct =
              m.targetValue > 0
                ? Math.min(100, Math.round((m.currentValue / m.targetValue) * 100))
                : 0;
            const lograda = pct >= 100;
            const vencida = m.periodEnd < today && pct < 100;
            const stateCls = lograda ? ' meta-state-done' : vencida ? ' meta-state-overdue' : '';
            return (
              <li key={m.goalId}>
                <button type="button" className={`meta-money meta-money-btn${stateCls}`} onClick={() => setDetail(m)} aria-label={`Ver meta ${m.title}`}>
                  <div className="meta-money-head">
                    <span className="fin-row-name">{m.title}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {m.metric === 'money_in' ? 'ingresos' : 'balance'}
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
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted" style={{ marginBottom: 12 }}>
          Sin metas de dinero todavía.
        </p>
      )}

      <button type="button" className="btn-ghost meta-add" onClick={() => setOpen(true)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Nueva meta de dinero
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Finanzas" title="Nueva meta de dinero">
        <MetaForm projects={projects} today={today} onDone={() => setOpen(false)} />
      </Modal>

      <Modal
        open={detail !== null}
        onClose={closeDetail}
        eyebrow="Meta de dinero"
        title={editing ? `Editar · ${detail?.title ?? ''}` : (detail?.title ?? '')}
      >
        {detail &&
          (editing ? (
            <MetaForm
              projects={projects}
              today={today}
              initial={detail}
              onDone={() => {
                closeDetail();
                router.refresh();
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <MetaDetalle
              meta={detail}
              today={today}
              onEdit={() => setEditing(true)}
              onDeleted={() => {
                closeDetail();
                router.refresh();
              }}
            />
          ))}
      </Modal>
    </div>
  );
}

/** Detalle completo de una meta: progreso, objetivo/actual/falta, periodo, ritmo. */
function MetaDetalle({
  meta,
  today,
  onEdit,
  onDeleted,
}: {
  meta: MetaProgreso;
  today: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function borrar() {
    if (!confirm(`¿Borrar la meta "${meta.title}"?`)) return;
    startTransition(async () => {
      const r = await deleteMoneyGoalAction(meta.goalId);
      if (r.ok) onDeleted();
    });
  }
  const pct = meta.targetValue > 0 ? Math.min(100, Math.round((meta.currentValue / meta.targetValue) * 100)) : 0;
  const faltaPesos = Math.max(0, meta.targetValue - meta.currentValue);
  const lograda = pct >= 100;

  const start = dayNum(meta.periodStart);
  const end = dayNum(meta.periodEnd);
  const now = dayNum(today);
  const totalDias = Math.max(1, end - start);
  const diasRestantes = end - now;
  const transcurridoPct = Math.max(0, Math.min(100, Math.round(((now - start) / totalDias) * 100)));
  const vencida = now > end && !lograda;

  // Ritmo: compara progreso contra tiempo transcurrido (solo mientras esté vigente).
  let ritmo: { txt: string; tone: 'pos' | 'neg' | 'muted' } = { txt: '', tone: 'muted' };
  if (lograda) ritmo = { txt: '🎉 ¡Meta lograda!', tone: 'pos' };
  else if (vencida) ritmo = { txt: `Venció sin alcanzarse (llegó al ${pct}%).`, tone: 'neg' };
  else if (pct >= transcurridoPct) ritmo = { txt: `Vas al día: ${pct}% de la meta con ${transcurridoPct}% del tiempo.`, tone: 'pos' };
  else ritmo = { txt: `Vas algo atrás: ${pct}% de la meta con ${transcurridoPct}% del tiempo.`, tone: 'neg' };

  return (
    <div className="meta-detail">
      <div className="meta-bar meta-bar-lg">
        <div className={`meta-bar-fill${lograda ? ' meta-done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="meta-detail-pct">
        <span className={lograda ? 'fin-pos' : vencida ? 'overdue' : ''}>{pct}%</span>
        <span className="muted">
          {money(meta.currentValue * 100)} de {money(meta.targetValue * 100)}
        </span>
      </div>

      <dl className="meta-detail-dl">
        <div>
          <dt>Mide</dt>
          <dd>{meta.metric === 'money_in' ? 'Ingresos del periodo' : 'Balance (ingresos − gastos)'}</dd>
        </div>
        <div>
          <dt>Proyecto</dt>
          <dd>{meta.projectTitle}</dd>
        </div>
        <div>
          <dt>Objetivo</dt>
          <dd>{money(meta.targetValue * 100)}</dd>
        </div>
        <div>
          <dt>Llevas</dt>
          <dd>{money(meta.currentValue * 100)}</dd>
        </div>
        <div>
          <dt>{lograda ? 'Excedente' : 'Falta'}</dt>
          <dd className={lograda ? 'fin-pos' : undefined}>
            {lograda ? money((meta.currentValue - meta.targetValue) * 100) : money(faltaPesos * 100)}
          </dd>
        </div>
        <div>
          <dt>Periodo</dt>
          <dd>{meta.periodStart} → {meta.periodEnd}</dd>
        </div>
        <div>
          <dt>Tiempo</dt>
          <dd>
            {vencida
              ? 'Vencida'
              : diasRestantes <= 0
                ? 'Último día'
                : `Quedan ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`}
          </dd>
        </div>
      </dl>

      <p className={`meta-detail-ritmo ${ritmo.tone === 'pos' ? 'fin-pos' : ritmo.tone === 'neg' ? 'overdue' : 'muted'}`}>
        {ritmo.txt}
      </p>

      <div className="meta-detail-actions">
        <button type="button" className="btn-primary" onClick={onEdit} disabled={pending}>
          Editar
        </button>
        <button type="button" className="btn-ghost meta-del" onClick={borrar} disabled={pending}>
          {pending ? '…' : 'Borrar'}
        </button>
      </div>
    </div>
  );
}

function MetaForm({
  projects,
  today,
  initial,
  onDone,
  onCancel,
}: {
  projects: Project[];
  today: string;
  initial?: MetaProgreso;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const editando = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [metric, setMetric] = useState<'money_in' | 'money_net'>(initial?.metric ?? 'money_in');
  const [objetivo, setObjetivo] = useState(initial ? String(initial.targetValue) : '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? projects[0]?.id ?? '');
  const [desde, setDesde] = useState(initial?.periodStart ?? firstOfMonth(today));
  const [hasta, setHasta] = useState(initial?.periodEnd ?? lastOfMonth(today));
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
      const res = editando
        ? await updateMoneyGoalAction({
            id: initial!.goalId,
            title: t,
            metric,
            targetValue: minor / 100,
            projectId,
            periodStart: desde,
            periodEnd: hasta,
          })
        : await createMoneyGoalAction({
            title: t,
            metric,
            targetValue: minor / 100, // pesos
            projectId,
            periodStart: desde,
            periodEnd: hasta,
          });
      if (!res.ok) setError(res.message ?? 'No se pudo guardar');
      else onDone();
    });
  }

  return (
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
        <SegSelect
          ariaLabel="Métrica de la meta"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'money_in', label: 'Ingresos' },
            { value: 'money_net', label: 'Balance' },
          ]}
        />
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
          <div className="cal-field-label" style={{ flex: 1 }}>
            Desde
            <DateField value={desde} onChange={setDesde} ariaLabel="Desde" />
          </div>
          <div className="cal-field-label" style={{ flex: 1 }}>
            Hasta
            <DateField value={hasta} onChange={setHasta} min={desde} ariaLabel="Hasta" />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="meta-detail-actions">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? '…' : editando ? 'Guardar cambios' : 'Crear meta de dinero'}
          </button>
          {onCancel && (
            <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
              Cancelar
            </button>
          )}
        </div>
      </form>
  );
}
