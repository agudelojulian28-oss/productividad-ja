'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmRecurringExpenseAction, skipRecurringExpenseAction } from '@/app/actions/finance';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { money } from '@/lib/format';

export type DueItem = {
  id: string;
  title: string;
  projectTitle: string;
  amountMinor: number;
  nextDueOn: string;
};

type Receipt = { data: string; preview: string };

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

/** Pop-up de rectificación de gastos recurrentes vencidos. Aparece en toda la app.
 *  Por cada uno: editar el monto, adjuntar comprobante, y "Sí" (registra) o "No se hizo". */
export function RecurrentesPopup({ items }: { items: DueItem[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [monto, setMonto] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);

  if (closed || items.length === 0 || i >= items.length) return null;
  const item = items[i]!;

  function reset() {
    setMonto('');
    setReceipt(null);
  }
  function advance() {
    reset();
    if (i + 1 >= items.length) {
      setClosed(true);
      router.refresh();
    } else {
      setI(i + 1);
    }
  }

  async function confirmar() {
    setBusy(true);
    const override = parseAmountToMinor(monto);
    await confirmRecurringExpenseAction({
      id: item.id,
      amountMinor: override || undefined,
      receipt: receipt ? { mediaType: 'image/jpeg', data: receipt.data } : null,
    });
    setBusy(false);
    advance();
  }

  async function noSeHizo() {
    setBusy(true);
    await skipRecurringExpenseAction(item.id);
    setBusy(false);
    advance();
  }

  return (
    <div className="recur-pop-backdrop" role="dialog" aria-modal="true" aria-label="Gasto recurrente">
      <div className="recur-pop">
        <div className="recur-pop-head">
          <span className="recur-pop-eyebrow">Gasto recurrente · vencía {item.nextDueOn}</span>
          <h2 className="recur-pop-title">{item.title}</h2>
          <span className="recur-pop-proj">{item.projectTitle}</span>
        </div>

        <p className="recur-pop-q">¿Se hizo este gasto?</p>

        <label className="cal-field-label">
          Monto (edítalo si cambió)
          <input
            type="text"
            inputMode="decimal"
            placeholder={money(item.amountMinor)}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="field"
            aria-label="Monto"
            autoComplete="off"
          />
        </label>

        <div className="cal-field-label">
          Comprobante (opcional)
          {receipt ? (
            <div className="receipt-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receipt.preview} alt="comprobante" />
              <button type="button" aria-label="Quitar" onClick={() => setReceipt(null)}>
                ✕
              </button>
            </div>
          ) : (
            <label className="field receipt-pick" style={{ cursor: 'pointer' }}>
              📎 Adjuntar foto del comprobante
              <input
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
                      /* ignora */
                    }
                  }
                }}
              />
            </label>
          )}
        </div>

        <div className="recur-pop-actions">
          <button type="button" className="btn-primary" disabled={busy} onClick={confirmar}>
            {busy ? '…' : 'Sí, registrar'}
          </button>
          <button type="button" className="linkbtn" disabled={busy} onClick={noSeHizo}>
            No se hizo
          </button>
          <button type="button" className="linkbtn" disabled={busy} onClick={() => setClosed(true)}>
            Ahora no
          </button>
        </div>
        {items.length > 1 && (
          <span className="recur-pop-count">
            {i + 1} de {items.length}
          </span>
        )}
      </div>
    </div>
  );
}
