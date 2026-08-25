'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/format';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { sustainingSummary, monthlyEquivalent, toCopMinor } from '@/core/finance/sustaining';
import type { SustainingServiceRow } from '@/core/finance/ports';
import type { Trm } from '@/lib/trm';
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
const CURRENCY = [
  { v: 'COP', label: 'COP ($)' },
  { v: 'USD', label: 'USD (US$)' },
];
const labelOf = (arr: { v: string; label: string }[], v: string) => arr.find((x) => x.v === v)?.label ?? v;
const STATUS_ORDER = ['paga', 'gratis', 'futuro'];
const toMinor = (s: string) => (s.trim() === '' ? 0 : (parseAmountToMinor(s) ?? 0));
const fromMinor = (m: number | null) => (m == null ? '' : String(Math.round(m / 100)));
/** Formatea un monto en su propia moneda: COP con `money()`, USD como "US$X". */
const usd = (minor: number) => 'US$' + (minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const inCurrency = (minor: number, currency: 'COP' | 'USD') =>
  currency === 'USD' ? usd(minor) : money(minor, { compact: true });

export function SostenimientoManager({
  services,
  budget,
  today,
  trm,
}: {
  services: Row[];
  budget: { usdSpent: number; limitUsd: number };
  today: string;
  trm: Trm;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const summary = useMemo(() => sustainingSummary(services, today, trm.value), [services, today, trm.value]);
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
        currency: v.currency,
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
      {/* TRM del día (convierte los servicios en dólares) */}
      <div className="sos-trm" title={trm.fallback ? 'No se pudo consultar la TRM oficial; se usa un valor de respaldo.' : `TRM oficial${trm.date ? ' vigente ' + trm.date : ''}`}>
        <span className="sos-trm-k">TRM</span>
        <span className="sos-trm-v">${trm.value.toLocaleString('es-CO', { maximumFractionDigits: 2 })}/US$</span>
        <span className="sos-trm-note">{trm.fallback ? 'aprox.' : trm.date || 'hoy'}</span>
      </div>

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
                ? `⚠ Recarga ${a.name}: quedan ${inCurrency(a.balanceMinor ?? 0, a.currency)}`
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
                      {s.amountMinor > 0
                        ? ` · ${inCurrency(monthlyEquivalent(s.amountMinor, s.cadence), s.currency)}/mes${
                            s.currency === 'USD'
                              ? ` ≈ ${money(toCopMinor(monthlyEquivalent(s.amountMinor, s.cadence), 'USD', trm.value), { compact: true })}`
                              : ''
                          }`
                        : ''}
                      {s.balanceMinor != null ? ` · saldo ${inCurrency(s.balanceMinor, s.currency)}` : ''}
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
  currency: string;
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
    currency: init?.currency ?? 'COP',
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
      <div className="rt-form-row">
        <label className="cal-field-label" style={{ width: 130 }}>
          Moneda
          <select className="field" value={v.currency} onChange={(e) => set('currency', e.target.value)}>
            {CURRENCY.map((c) => (
              <option key={c.v} value={c.v}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="cal-field-label" style={{ flex: 1 }}>
          Monto ({v.currency}) {v.cadence === 'anual' ? '· al año' : v.cadence === 'uso' ? '· estimado al mes' : ''}
          <input className="field" inputMode="decimal" value={v.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
        </label>
      </div>
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
