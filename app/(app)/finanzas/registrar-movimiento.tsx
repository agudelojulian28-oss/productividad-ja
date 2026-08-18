'use client';

import { useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import { registrarMovimientoAction, attachReceiptAction } from '@/app/actions/finance';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { money } from '@/lib/format';
import { SegSelect } from '../seg-select';
import { TagPicker, type TagOption } from './tags-ui';

type Receipt = { data: string; preview: string };

/** Lee una imagen y la reescala (máx. 1600px, JPEG) para el comprobante. */
async function fileToReceipt(file: File): Promise<Receipt> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  let { width, height } = bitmap;
  if (width > max || height > max) {
    const s = max / Math.max(width, height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { data: dataUrl.split(',')[1]!, preview: dataUrl };
}

type Project = { id: string; title: string; areaId: string };

export function RegistrarMovimiento({
  projects,
  today,
  tags = [],
  onDone,
}: {
  projects: Project[];
  today: string;
  tags?: TagOption[];
  /** Si se pasa, se invoca tras registrar con éxito (p. ej. cerrar el modal). */
  onDone?: (summary: string) => void;
}) {
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [monto, setMonto] = useState('');
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP');
  const [fx, setFx] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [category, setCategory] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [occurredOn, setOccurredOn] = useState(today);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
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
    if (!project) return setError('Elige un proyecto');
    if (currency === 'USD' && !(fxRate > 0)) return setError('Falta la tasa de cambio (COP por USD)');

    startTransition(async () => {
      const res = await registrarMovimientoAction({
        direction,
        amountMinor,
        currency,
        areaId: project.areaId,
        projectId: project.id,
        category: category.trim() || undefined,
        description: descripcion.trim() || undefined,
        occurredOn,
        fxRate: currency === 'USD' ? fxRate : undefined,
        tagIds,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo registrar');
      else {
        // Si hay comprobante, súbelo y enlázalo al movimiento recién creado.
        if (receipt) {
          const att = await attachReceiptAction({
            transactionId: res.value.id,
            mediaType: 'image/jpeg',
            data: receipt.data,
          });
          if (!att.ok) setError('El movimiento se registró, pero el comprobante no se pudo subir.');
        }
        setMonto('');
        setCategory('');
        setDescripcion('');
        setReceipt(null);
        setFx('');
        setTagIds([]);
        const summary = `${direction === 'in' ? 'Ingreso' : 'Gasto'} registrado: ${money(res.value.baseAmountMinor)}${receipt ? ' · con comprobante' : ''}`;
        if (onDone) onDone(summary);
        else setOkMsg(summary);
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
      <SegSelect
        ariaLabel="Moneda"
        value={currency}
        onChange={setCurrency}
        options={[
          { value: 'COP', label: 'COP' },
          { value: 'USD', label: 'USD' },
        ]}
      />

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
        Proyecto
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="field"
        >
          {projects.length === 0 && <option value="">Crea un proyecto primero</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>

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

      <div className="cal-field-label">
        Comprobante (opcional)
        <input
          ref={receiptRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) {
              try {
                setReceipt(await fileToReceipt(f));
              } catch {
                setError('No pude leer esa imagen.');
              }
            }
          }}
        />
        {receipt ? (
          <div className="receipt-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receipt.preview} alt="comprobante" />
            <button type="button" aria-label="Quitar comprobante" onClick={() => setReceipt(null)}>
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="field receipt-pick"
            onClick={() => receiptRef.current?.click()}
          >
            📎 Adjuntar foto del comprobante
          </button>
        )}
      </div>

      <div className="cal-field-label">
        Etiquetas (opcional)
        <TagPicker catalog={tags} selected={tagIds} onChange={setTagIds} />
      </div>

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
