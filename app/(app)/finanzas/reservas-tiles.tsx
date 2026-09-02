'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/format';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { Modal } from '../modal';
import { SegSelect } from '../seg-select';
import { DateField } from '../date-picker';
import {
  updateReserveFundAction,
  addFlujoAllocationAction,
  addEmergencyMovementAction,
  type ReservasData,
} from '@/app/actions/finance';

const toMinor = (s: string) => (s.trim() === '' ? 0 : (parseAmountToMinor(s) ?? 0));
const toPesos = (m: number) => String(Math.round(m / 100));
const pct = (bal: number, target: number) => (target > 0 ? Math.min(100, Math.round((bal / target) * 100)) : 0);

/** Barra de progreso hacia la meta (medidor de una hue). */
function Meter({ balance, target, tone = 'acc' }: { balance: number; target: number; tone?: 'acc' | 'neg' }) {
  return (
    <div className="rsv-meter" aria-hidden="true">
      <div className={`rsv-meter-fill rsv-${tone}`} style={{ width: `${pct(balance, target)}%` }} />
    </div>
  );
}

export function ReservasTiles({ data, today }: { data: ReservasData; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [emergOpen, setEmergOpen] = useState(false);
  const [flujoPop, setFlujoPop] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const monthKey = today.slice(0, 7);

  // Pop-up mensual del flujo: día 2–3 del mes, bajo meta, sin aporte este mes y no
  // saltado antes. Si la meta está cumplida, no pregunta.
  useEffect(() => {
    const day = Number(today.slice(8, 10));
    if (day < 2 || day > 3) return;
    if (!data.flujo.belowTarget) return;
    if (data.flujoAllocatedThisMonth) return;
    let skipped = false;
    try {
      skipped = localStorage.getItem(`flujo-skip-${monthKey}`) === '1';
    } catch {
      skipped = false;
    }
    if (!skipped) setPromptOpen(true);
  }, [today, monthKey, data.flujo.belowTarget, data.flujoAllocatedThisMonth]);

  function refresh() {
    router.refresh();
  }

  return (
    <>
      {/* Flujo de caja — color ingresos, specs en hover/tap */}
      <div
        className="rsv-tile-wrap"
        onMouseEnter={() => setFlujoPop(true)}
        onMouseLeave={() => setFlujoPop(false)}
      >
        <button
          type="button"
          className="kpi rsv-tile"
          onClick={() => setFlujoPop((p) => !p)}
          aria-expanded={flujoPop}
          aria-label="Flujo de caja, ver detalle"
        >
          <div className="kpi-k">Flujo de caja</div>
          <div className="kpi-vrow">
            <span className="kpi-v kpi-acc">{money(data.flujo.balanceMinor, { compact: true })}</span>
          </div>
          <div className="kpi-sub">
            {data.flujo.targetMinor > 0
              ? data.flujo.belowTarget
                ? `${pct(data.flujo.balanceMinor, data.flujo.targetMinor)}% · faltan ${money(data.flujo.remainingMinor, { compact: true })}`
                : '✓ meta cumplida'
              : 'para uso diario'}
          </div>
          {data.flujo.targetMinor > 0 && <Meter balance={data.flujo.balanceMinor} target={data.flujo.targetMinor} />}
        </button>
        {flujoPop && (
          <FlujoPopover
            data={data}
            pending={pending}
            onSaveMeta={(target) =>
              start(async () => {
                await updateReserveFundAction({ id: data.flujo.fundId, targetMinor: target });
                refresh();
              })
            }
          />
        )}
      </div>

      {/* Fondo de emergencia — rojo si está bajo meta, clic abre el modal */}
      <button
        type="button"
        className={`kpi rsv-tile${data.emergencia.belowTarget ? ' rsv-danger' : ''}`}
        onClick={() => setEmergOpen(true)}
        aria-label="Fondo de emergencia, abrir"
      >
        <div className="kpi-k">Fondo de emergencia</div>
        <div className="kpi-vrow">
          <span className={`kpi-v${data.emergencia.belowTarget ? ' kpi-neg' : ' kpi-pos'}`}>
            {money(data.emergencia.balanceMinor, { compact: true })}
          </span>
        </div>
        <div className="kpi-sub">
          {data.emergencia.targetMinor > 0
            ? data.emergencia.belowTarget
              ? `⚠ faltan ${money(data.emergencia.remainingMinor, { compact: true })} para la meta`
              : '✓ meta cumplida'
            : 'toca para configurar'}
        </div>
        {data.emergencia.targetMinor > 0 && (
          <Meter
            balance={data.emergencia.balanceMinor}
            target={data.emergencia.targetMinor}
            tone={data.emergencia.belowTarget ? 'neg' : 'acc'}
          />
        )}
      </button>

      {promptOpen && (
        <FlujoPrompt
          data={data}
          pending={pending}
          onAllocate={(amountMinor) =>
            start(async () => {
              const r = await addFlujoAllocationAction({ fundId: data.flujo.fundId, amountMinor, occurredOn: today });
              if (r.ok) {
                setPromptOpen(false);
                refresh();
              }
            })
          }
          onSaveMeta={(target) =>
            start(async () => {
              await updateReserveFundAction({ id: data.flujo.fundId, targetMinor: target });
              refresh();
            })
          }
          onSkip={() => {
            try {
              localStorage.setItem(`flujo-skip-${monthKey}`, '1');
            } catch {
              /* sin persistencia */
            }
            setPromptOpen(false);
          }}
        />
      )}

      {emergOpen && (
        <EmergencyModal
          data={data}
          today={today}
          pending={pending}
          onClose={() => setEmergOpen(false)}
          onMove={(input, done) =>
            start(async () => {
              const r = await addEmergencyMovementAction(input);
              if (r.ok) {
                done();
                refresh();
              }
            })
          }
          onSaveFund={(patch, done) =>
            start(async () => {
              await updateReserveFundAction({ id: data.emergencia.fundId, ...patch });
              done();
              refresh();
            })
          }
        />
      )}
    </>
  );
}

// ── Popover de specs del flujo ─────────────────────────────────────────────
function FlujoPopover({
  data,
  pending,
  onSaveMeta,
}: {
  data: ReservasData;
  pending: boolean;
  onSaveMeta: (targetMinor: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState(toPesos(data.flujo.targetMinor));
  return (
    <div className="rsv-pop" role="dialog" aria-label="Detalle del flujo de caja">
      <p className="rsv-pop-title">Flujo de caja · uso diario</p>
      <p className="rsv-pop-text">
        Dinero apartado del balance del mes para el día a día. Sale del balance, pero no se
        descuenta (solo se aparta).
      </p>
      <dl className="rsv-pop-dl">
        <div>
          <dt>Apartado</dt>
          <dd>{money(data.flujo.balanceMinor)}</dd>
        </div>
        <div>
          <dt>Meta</dt>
          <dd>{data.flujo.targetMinor > 0 ? money(data.flujo.targetMinor) : '—'}</dd>
        </div>
        <div>
          <dt>Falta</dt>
          <dd>{money(data.flujo.remainingMinor)}</dd>
        </div>
      </dl>
      {editing ? (
        <div className="rsv-meta-edit">
          <input
            className="field"
            inputMode="decimal"
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            aria-label="Meta del flujo (COP)"
            placeholder="Meta en COP"
          />
          <button type="button" className="btn-primary" disabled={pending} onClick={() => onSaveMeta(toMinor(meta))}>
            {pending ? '…' : 'Guardar'}
          </button>
        </div>
      ) : (
        <button type="button" className="btn-ghost rsv-meta-btn" onClick={() => setEditing(true)}>
          Editar meta
        </button>
      )}
    </div>
  );
}

// ── Pop-up mensual del flujo ───────────────────────────────────────────────
function FlujoPrompt({
  data,
  pending,
  onAllocate,
  onSaveMeta,
  onSkip,
}: {
  data: ReservasData;
  pending: boolean;
  onAllocate: (amountMinor: number) => void;
  onSaveMeta: (targetMinor: number) => void;
  onSkip: () => void;
}) {
  const sugerido = Math.max(0, Math.min(data.flujo.remainingMinor, data.lastMonthBalanceMinor));
  const [amount, setAmount] = useState(toPesos(sugerido));
  const [editMeta, setEditMeta] = useState(false);
  const [meta, setMeta] = useState(toPesos(data.flujo.targetMinor));
  return (
    <Modal open onClose={onSkip} eyebrow="Cierre de mes" title="¿Cuánto apartas para el flujo de caja?" size="sm">
      <p className="rsv-prompt-lead">
        El mes pasado ({data.lastMonthLabel}) tu balance fue{' '}
        <strong>{money(data.lastMonthBalanceMinor)}</strong>. Aparta lo que quieras para el uso diario,
        hacia tu meta de {data.flujo.targetMinor > 0 ? money(data.flujo.targetMinor) : '—'}.
      </p>
      <label className="cal-field-label">
        Monto a apartar (COP)
        <input
          className="field"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Monto a apartar"
        />
      </label>
      {editMeta && (
        <label className="cal-field-label">
          Nueva meta (COP)
          <div className="rsv-meta-edit">
            <input className="field" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} aria-label="Meta del flujo" />
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => onSaveMeta(toMinor(meta))}>
              Guardar meta
            </button>
          </div>
        </label>
      )}
      <div className="rsv-prompt-actions">
        <button type="button" className="btn-primary" disabled={pending || toMinor(amount) <= 0} onClick={() => onAllocate(toMinor(amount))}>
          {pending ? '…' : `Apartar ${money(toMinor(amount), { compact: true })}`}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setEditMeta((v) => !v)}>
          {editMeta ? 'Ocultar meta' : 'Editar meta'}
        </button>
        <button type="button" className="btn-ghost" onClick={onSkip}>
          Ahora no
        </button>
      </div>
    </Modal>
  );
}

// ── Modal del fondo de emergencia (dos columnas) ───────────────────────────
type EmergInput = { direction: 'in' | 'out'; amountMinor: number; occurredOn?: string; description?: string | null };

function EmergencyModal({
  data,
  today,
  pending,
  onClose,
  onMove,
  onSaveFund,
}: {
  data: ReservasData;
  today: string;
  pending: boolean;
  onClose: () => void;
  onMove: (input: EmergInput, done: () => void) => void;
  onSaveFund: (patch: { targetMinor?: number; description?: string | null }, done: () => void) => void;
}) {
  const e = data.emergencia;
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [desc, setDesc] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);
  const [showAjustes, setShowAjustes] = useState(false);
  const [meta, setMeta] = useState(toPesos(e.targetMinor));
  const [description, setDescription] = useState(e.description ?? '');

  const amountMinor = toMinor(amount);
  const runningRows = useMemo(() => {
    // Saldo corrido (los movimientos vienen del más reciente al más antiguo).
    let bal = e.balanceMinor;
    return e.movements.map((m) => {
      const row = { ...m, saldo: bal };
      bal += m.direction === 'in' ? -m.amountMinor : m.amountMinor;
      return row;
    });
  }, [e.movements, e.balanceMinor]);

  function reset() {
    setAmount('');
    setDesc('');
    setConfirmOut(false);
  }
  function submit() {
    if (amountMinor <= 0) return;
    if (direction === 'out' && !confirmOut) {
      setConfirmOut(true);
      return;
    }
    onMove({ direction, amountMinor, occurredOn, description: desc.trim() || null }, reset);
  }

  return (
    <Modal open onClose={onClose} eyebrow="Reservas" title="Fondo de emergencia" size="lg">
      {/* Cabecera: saldo + meta + descripción */}
      <div className="rsv-emerg-head">
        <div>
          <span className="rsv-emerg-k">Saldo del fondo</span>
          <span className={`rsv-emerg-v${e.belowTarget ? ' neg' : ' pos'}`}>{money(e.balanceMinor)}</span>
          {e.targetMinor > 0 && (
            <>
              <Meter balance={e.balanceMinor} target={e.targetMinor} tone={e.belowTarget ? 'neg' : 'acc'} />
              <span className="rsv-emerg-cap">
                {e.belowTarget
                  ? `Faltan ${money(e.remainingMinor)} para la meta de ${money(e.targetMinor)}`
                  : `Meta de ${money(e.targetMinor)} cumplida`}
              </span>
            </>
          )}
          {e.description && <p className="rsv-emerg-desc">{e.description}</p>}
        </div>
        <button type="button" className="btn-ghost" onClick={() => setShowAjustes((v) => !v)}>
          {showAjustes ? 'Cerrar ajustes' : 'Meta y descripción'}
        </button>
      </div>

      {showAjustes && (
        <div className="rsv-ajustes">
          <label className="cal-field-label">
            Meta (COP)
            <input className="field" inputMode="decimal" value={meta} onChange={(ev) => setMeta(ev.target.value)} aria-label="Meta del fondo" />
          </label>
          <button
            type="button"
            className="btn-ghost rsv-suggest"
            onClick={() => setMeta(toPesos(data.suggestedTargetMinor))}
            disabled={data.suggestedTargetMinor <= 0}
          >
            Usar 6 meses de gastos (~{money(data.suggestedTargetMinor, { compact: true })})
          </button>
          <label className="cal-field-label">
            Descripción
            <textarea
              className="field"
              rows={2}
              value={description}
              maxLength={2000}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="Ej. 6 meses de mis gastos mensuales."
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() => onSaveFund({ targetMinor: toMinor(meta), description: description.trim() || null }, () => setShowAjustes(false))}
          >
            {pending ? '…' : 'Guardar'}
          </button>
        </div>
      )}

      <div className="rsv-grid">
        {/* Izquierda: registrar movimiento */}
        <div className="rsv-col">
          <h4 className="rsv-col-h">Registrar movimiento</h4>
          <SegSelect
            ariaLabel="Tipo de movimiento"
            value={direction}
            onChange={(v) => {
              setDirection(v);
              setConfirmOut(false);
            }}
            options={[
              { value: 'in', label: 'Aportar' },
              { value: 'out', label: 'Retirar' },
            ]}
          />
          <input
            className="field"
            inputMode="decimal"
            placeholder="Monto (COP)"
            value={amount}
            onChange={(ev) => {
              setAmount(ev.target.value);
              setConfirmOut(false);
            }}
            aria-label="Monto"
          />
          <div className="cal-field-label">
            Fecha
            <DateField value={occurredOn} onChange={setOccurredOn} ariaLabel="Fecha del movimiento" />
          </div>
          <input
            className="field"
            placeholder="Descripción (opcional)"
            value={desc}
            onChange={(ev) => setDesc(ev.target.value)}
            aria-label="Descripción"
          />
          {direction === 'in' && (
            <p className="rsv-note">Aportar cuenta como un <strong>gasto de tu balance</strong> (la plata queda apartada).</p>
          )}
          {confirmOut && (
            <div className="rsv-danger-box" role="alertdialog" aria-label="Confirmar retiro">
              <p>
                ⚠ <strong>Peligro.</strong> Este dinero solo debe gastarse en una emergencia real.
                ¿Confirmas retirar {money(amountMinor)}?
              </p>
              <div className="rsv-danger-actions">
                <button type="button" className="btn-danger" disabled={pending} onClick={submit}>
                  {pending ? '…' : 'Sí, retirar'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmOut(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {!confirmOut && (
            <button type="button" className="btn-primary rsv-submit" disabled={pending || amountMinor <= 0} onClick={submit}>
              {pending ? '…' : direction === 'in' ? 'Aportar al fondo' : 'Retirar del fondo'}
            </button>
          )}
        </div>

        {/* Derecha: movimientos */}
        <div className="rsv-col">
          <h4 className="rsv-col-h">Movimientos</h4>
          {runningRows.length === 0 ? (
            <p className="muted">Aún no hay movimientos en el fondo.</p>
          ) : (
            <ul className="rsv-movs">
              {runningRows.map((m) => (
                <li key={m.id} className="rsv-mov">
                  <div className="rsv-mov-main">
                    <span className={`rsv-mov-amt ${m.direction === 'in' ? 'pos' : 'neg'}`}>
                      {m.direction === 'in' ? '+' : '−'}
                      {money(m.amountMinor, { compact: true })}
                    </span>
                    <span className="rsv-mov-desc">{m.description || (m.direction === 'in' ? 'Aporte' : 'Retiro')}</span>
                  </div>
                  <div className="rsv-mov-meta">
                    <span>{m.occurredOn}</span>
                    <span>saldo {money(m.saldo, { compact: true })}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
