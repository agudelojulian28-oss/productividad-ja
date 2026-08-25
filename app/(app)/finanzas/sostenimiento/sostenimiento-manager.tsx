'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/format';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { sustainingSummary, monthlyEquivalent } from '@/core/finance/sustaining';
import type { SustainingServiceRow } from '@/core/finance/ports';
import {
  createSustainingAction,
  updateSustainingAction,
  deleteSustainingAction,
  seedSustainingSugeridosAction,
} from '@/app/actions/finance';
import { DateField } from '../../date-picker';

type Row = SustainingServiceRow;

const CATEGORY = [
  { v: 'ia', label: 'IA' },
  { v: 'infra', label: 'Infraestructura' },
  { v: 'canal', label: 'Canal' },
  { v: 'dominio', label: 'Dominio' },
  { v: 'otro', label: 'Otro' },
];
const STATUS = [
  { v: 'paga', label: 'Paga hoy' },
  { v: 'gratis', label: 'Gratis' },
  { v: 'futuro', label: 'Futuro' },
];
const CADENCE = [
  { v: 'mensual', label: 'Mensual' },
  { v: 'anual', label: 'Anual' },
  { v: 'uso', label: 'Por uso' },
  { v: 'unico', label: 'Único' },
];
const labelOf = (arr: { v: string; label: string }[], v: string) => arr.find((x) => x.v === v)?.label ?? v;
const STATUS_ORDER = ['paga', 'gratis', 'futuro'];
const toMinor = (s: string) => (s.trim() === '' ? 0 : (parseAmountToMinor(s) ?? 0));
const fromMinor = (m: number | null) => (m == null ? '' : String(Math.round(m / 100)));

export function SostenimientoManager({
  services,
  budget,
  today,
}: {
  services: Row[];
  budget: { usdSpent: number; limitUsd: number };
  today: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const summary = useMemo(() => sustainingSummary(services, today), [services, today]);
  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const s of services) (m.get(s.status) ?? m.set(s.status, []).get(s.status)!).push(s);
    return STATUS_ORDER.filter((st) => m.has(st)).map((st) => [st, m.get(st)!] as const);
  }, [services]);

  const budgetPct = budget.limitUsd > 0 ? Math.round((budget.usdSpent / budget.limitUsd) * 100) : 0;

  function submit(v: FormValues, id?: string) {
    start(async () => {
      const payload = {
        name: v.name.trim(),
        provider: v.provider.trim() || null,
        category: v.category,
        status: v.status,
        cadence: v.cadence,
        amountMinor: toMinor(v.amount),
        balanceMinor: v.balance.trim() === '' ? null : toMinor(v.balance),
        alertThresholdMinor: v.threshold.trim() === '' ? null : toMinor(v.threshold),
        renewsOn: v.renewsOn || null,
        notes: v.notes.trim() || null,
      };
      const r = id ? await updateSustainingAction({ id, ...payload }) : await createSustainingAction(payload);
      if (r.ok) {
        setCreating(false);
        setEditing(null);
        router.refresh();
      }
    });
  }
  function remove(id: string, name: string) {
    if (!confirm(`¿Quitar "${name}" del sostenimiento?`)) return;
    start(async () => {
      const r = await deleteSustainingAction(id);
      if (r.ok) router.refresh();
    });
  }
  function seed() {
    start(async () => {
      const r = await seedSustainingSugeridosAction();
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="sos">
      {/* Contador */}
      <div className="sos-counters">
        <div className="fin-gen-tile hero">
          <span className="fin-gen-k">Sostenimiento / mes</span>
          <span className="fin-gen-v">{money(summary.monthlyTotalMinor, { compact: true })}</span>
        </div>
        <div className="fin-gen-tile">
          <span className="fin-gen-k">Posible a futuro</span>
          <span className="fin-gen-v">{money(summary.futurosMinor, { compact: true })}</span>
        </div>
        <div className="fin-gen-tile">
          <span className="fin-gen-k">Consumo de Aura (mes)</span>
          <span className="fin-gen-v">US${budget.usdSpent.toFixed(2)}</span>
          <div className="sos-budget-track">
            <div className="sos-budget-fill" style={{ width: `${Math.min(100, budgetPct)}%` }} />
          </div>
          <span className="sos-budget-cap">de US${budget.limitUsd.toFixed(0)}</span>
        </div>
      </div>

      {summary.alerts.length > 0 && (
        <div className="sos-alerts" role="status">
          {summary.alerts.map((a) => (
            <p key={`${a.id}-${a.kind}`} className="sos-alert">
              {a.kind === 'recargar'
                ? `⚠ Recarga ${a.name}: quedan ${money(a.balanceMinor ?? 0, { compact: true })}`
                : `📅 ${a.name} se renueva el ${a.renewsOn}`}
            </p>
          ))}
        </div>
      )}

      <div className="sos-actions">
        {!creating && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            + Agregar servicio
          </button>
        )}
        {services.length === 0 && (
          <button type="button" className="btn-ghost" onClick={seed} disabled={pending}>
            Agregar servicios sugeridos
          </button>
        )}
      </div>

      {creating && (
        <div className="rt-card">
          <ServiceForm pending={pending} onSubmit={(v) => submit(v)} onCancel={() => setCreating(false)} submitLabel="Crear" />
        </div>
      )}

      {grouped.map(([status, list]) => (
        <div key={status} className="sos-group">
          <p className="fin-stats-sub">{labelOf(STATUS, status)}</p>
          <ul className="rt-list">
            {list.map((s) =>
              editing === s.id ? (
                <li key={s.id} className="rt-card">
                  <ServiceForm
                    init={s}
                    pending={pending}
                    onSubmit={(v) => submit(v, s.id)}
                    onCancel={() => setEditing(null)}
                    submitLabel="Guardar"
                  />
                </li>
              ) : (
                <li key={s.id} className="rt-row">
                  <div className="rt-row-body">
                    <span className="rt-row-title">{s.name}</span>
                    <span className="rt-row-meta">
                      {labelOf(CATEGORY, s.category)} · {labelOf(CADENCE, s.cadence)}
                      {s.amountMinor > 0 ? ` · ${money(monthlyEquivalent(s.amountMinor, s.cadence), { compact: true })}/mes` : ''}
                      {s.balanceMinor != null ? ` · saldo ${money(s.balanceMinor, { compact: true })}` : ''}
                      {s.renewsOn ? ` · renueva ${s.renewsOn}` : ''}
                    </span>
                  </div>
                  <div className="rt-row-actions">
                    <button type="button" className="btn-ghost" onClick={() => setEditing(s.id)}>
                      Editar
                    </button>
                    <button type="button" className="btn-ghost rt-del" onClick={() => remove(s.id, s.name)}>
                      Quitar
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

type FormValues = {
  name: string;
  provider: string;
  category: string;
  status: string;
  cadence: string;
  amount: string;
  balance: string;
  threshold: string;
  renewsOn: string;
  notes: string;
};

function ServiceForm({
  init,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  init?: Row;
  pending: boolean;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [v, setV] = useState<FormValues>({
    name: init?.name ?? '',
    provider: init?.provider ?? '',
    category: init?.category ?? 'ia',
    status: init?.status ?? 'paga',
    cadence: init?.cadence ?? 'mensual',
    amount: fromMinor(init?.amountMinor ?? 0),
    balance: fromMinor(init?.balanceMinor ?? null),
    threshold: fromMinor(init?.alertThresholdMinor ?? null),
    renewsOn: init?.renewsOn ?? '',
    notes: init?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FormValues, val: string) => setV((p) => ({ ...p, [k]: val }));

  function go() {
    if (!v.name.trim()) return setError('El nombre es obligatorio');
    setError(null);
    onSubmit(v);
  }

  return (
    <div className="rt-form">
      <label className="cal-field-label">
        Servicio
        <input className="field" value={v.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="Ej. OpenAI — voz de Aura" />
      </label>
      <div className="rt-form-row">
        <label className="cal-field-label" style={{ flex: 1 }}>
          Proveedor
          <input className="field" value={v.provider} maxLength={80} onChange={(e) => set('provider', e.target.value)} />
        </label>
        <label className="cal-field-label" style={{ flex: 1 }}>
          Categoría
          <select className="field" value={v.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORY.map((c) => (
              <option key={c.v} value={c.v}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="rt-form-row">
        <label className="cal-field-label" style={{ flex: 1 }}>
          Estado
          <select className="field" value={v.status} onChange={(e) => set('status', e.target.value)}>
            {STATUS.map((c) => (
              <option key={c.v} value={c.v}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="cal-field-label" style={{ flex: 1 }}>
          Cadencia
          <select className="field" value={v.cadence} onChange={(e) => set('cadence', e.target.value)}>
            {CADENCE.map((c) => (
              <option key={c.v} value={c.v}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="cal-field-label">
        Monto (COP) {v.cadence === 'anual' ? '· al año' : v.cadence === 'uso' ? '· estimado al mes' : ''}
        <input className="field" inputMode="decimal" value={v.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
      </label>
      <div className="rt-form-row">
        <label className="cal-field-label" style={{ flex: 1 }}>
          Saldo/créditos (opcional)
          <input className="field" inputMode="decimal" value={v.balance} onChange={(e) => set('balance', e.target.value)} placeholder="—" />
        </label>
        <label className="cal-field-label" style={{ flex: 1 }}>
          Avisar si baja de (opcional)
          <input className="field" inputMode="decimal" value={v.threshold} onChange={(e) => set('threshold', e.target.value)} placeholder="—" />
        </label>
      </div>
      <div className="cal-field-label">
        Próxima renovación (opcional)
        <DateField value={v.renewsOn} onChange={(d) => set('renewsOn', d)} ariaLabel="Próxima renovación" />
      </div>
      <label className="cal-field-label">
        Notas (opcional)
        <textarea className="field" rows={2} value={v.notes} maxLength={2000} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="rt-form-actions">
        <button type="button" className="btn-primary" onClick={go} disabled={pending}>
          {pending ? '…' : submitLabel}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
