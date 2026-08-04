'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { registrarMovimientoAction } from '@/app/actions/finance';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { money } from '@/lib/format';

type Area = { id: string; name: string };
type Source = { id: string; name: string; areaId: string };

export function RegistrarMovimiento({
  areas,
  sources,
  today,
}: {
  areas: Area[];
  sources: Source[];
  today: string;
}) {
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [monto, setMonto] = useState('');
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP');
  const [fx, setFx] = useState('');
  const [areaId, setAreaId] = useState(areas[0]?.id ?? '');
  const [sourceId, setSourceId] = useState('');
  const [category, setCategory] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sourcesOfArea = useMemo(
    () => sources.filter((s) => s.areaId === areaId),
    [sources, areaId],
  );

  const amountMinor = parseAmountToMinor(monto);
  const fxRate = currency === 'USD' ? Number(fx.replace(',', '.')) : 1;
  const baseCop =
    amountMinor && currency === 'USD' && fxRate > 0
      ? Math.round(amountMinor * fxRate)
      : amountMinor;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!amountMinor) return setError('Monto inválido');
    if (!areaId) return setError('Elige un área');
    if (direction === 'in' && !sourceId) return setError('Un ingreso necesita una fuente');
    if (currency === 'USD' && !(fxRate > 0)) return setError('Falta la tasa de cambio (COP por USD)');

    startTransition(async () => {
      const res = await registrarMovimientoAction({
        direction,
        amountMinor,
        currency,
        areaId,
        incomeSourceId: direction === 'in' ? sourceId : undefined,
        category: category.trim() || undefined,
        description: descripcion.trim() || undefined,
        occurredOn,
        fxRate: currency === 'USD' ? fxRate : undefined,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo registrar');
      else {
        setMonto('');
        setCategory('');
        setDescripcion('');
        setFx('');
        setOkMsg(
          `${direction === 'in' ? 'Ingreso' : 'Gasto'} registrado: ${money(res.value.baseAmountMinor)}`,
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="fin-form">
      <div className="seg">
        <button
          type="button"
          className={`seg-btn${direction === 'out' ? ' seg-on' : ''}`}
          onClick={() => setDirection('out')}
        >
          Gasto
        </button>
        <button
          type="button"
          className={`seg-btn${direction === 'in' ? ' seg-on' : ''}`}
          onClick={() => setDirection('in')}
        >
          Ingreso
        </button>
      </div>

      <div className="fin-amount-row">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="field fin-amount"
          aria-label="Monto"
          autoComplete="off"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as 'COP' | 'USD')}
          className="field fin-cur"
          aria-label="Moneda"
        >
          <option value="COP">COP</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {currency === 'USD' && (
        <label className="cal-field-label">
          Tasa (COP por 1 USD)
          <input
            type="text"
            inputMode="decimal"
            placeholder="ej. 4000"
            value={fx}
            onChange={(e) => setFx(e.target.value)}
            className="field"
            aria-label="Tasa de cambio"
            autoComplete="off"
          />
          {baseCop && currency === 'USD' && fxRate > 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>
              ≈ {money(baseCop)} COP
            </span>
          ) : null}
        </label>
      )}

      <label className="cal-field-label">
        Área
        <select
          value={areaId}
          onChange={(e) => {
            setAreaId(e.target.value);
            setSourceId('');
          }}
          className="field"
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      {direction === 'in' && (
        <label className="cal-field-label">
          Fuente de ingreso
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="field"
          >
            <option value="">Elige una fuente…</option>
            {sourcesOfArea.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {sourcesOfArea.length === 0 && (
            <span className="muted" style={{ fontSize: 13 }}>
              Esta área no tiene fuentes. Crea una abajo.
            </span>
          )}
        </label>
      )}

      {direction === 'out' && (
        <label className="cal-field-label">
          Categoría (opcional)
          <input
            type="text"
            placeholder="ej. almuerzo, transporte"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="field"
            autoComplete="off"
          />
        </label>
      )}

      <label className="cal-field-label">
        Descripción (opcional)
        <input
          type="text"
          placeholder="ej. almuerzo con cliente, factura #044"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="field"
          autoComplete="off"
        />
      </label>

      <label className="cal-field-label">
        Fecha
        <input
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="field"
        />
      </label>

      {error && <p className="error-text">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}

      <button type="submit" className="btn-primary fin-submit" disabled={pending}>
        {pending ? '…' : direction === 'in' ? 'Registrar ingreso' : 'Registrar gasto'}
      </button>
    </form>
  );
}
