'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Selectores propios de fecha y hora (tema oscuro/naranja). Reemplazan los pickers
// nativos por un panel moderno: calendario + chips para la fecha, chips + rueda para
// la hora. API tipo drop-in: value (string) + onChange(value: string).
//  · DateField      value 'YYYY-MM-DD'
//  · TimeField      value 'HH:MM' (24h)
//  · DateTimeField  value 'YYYY-MM-DDTHH:MM'

const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MES_L = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DOW_LUN = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']; // etiqueta corta día
const DOW_HEAD = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // encabezado del calendario (lunes primero)

const pad = (n: number) => String(n).padStart(2, '0');

function todayLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parts(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function addDays(s: string, n: number): string {
  const { y, m, d } = parts(s);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
/** Día de semana con lunes=0 … domingo=6. */
function dowMon(y: number, m: number, d: number): number {
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}
function labelDate(s: string, today: string): string {
  if (!s) return 'Elegir fecha';
  if (s === today) return 'Hoy';
  if (s === addDays(today, 1)) return 'Mañana';
  if (s === addDays(today, -1)) return 'Ayer';
  const { y, m, d } = parts(s);
  const dow = DOW_LUN[dowMon(y, m, d)];
  const yearNow = new Date().getFullYear();
  return `${dow} ${d} ${MES_C[m - 1]}${y !== yearNow ? ` ${y}` : ''}`;
}
function label12(hhmm: string): string {
  if (!hhmm) return 'Elegir hora';
  const [h, mn] = hhmm.split(':').map(Number);
  const hh = h ?? 0;
  const ap = hh < 12 ? 'a. m.' : 'p. m.';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad(mn ?? 0)} ${ap}`;
}

/** Cierra el panel al hacer clic fuera o con Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

// ── Calendario ────────────────────────────────────────────────────────────────
function Calendar({
  value,
  onPick,
  min,
  max,
  today,
}: {
  value: string;
  onPick: (ymd: string) => void;
  min?: string;
  max?: string;
  today: string;
}) {
  const base = value || today;
  const [view, setView] = useState(() => {
    const { y, m } = parts(base);
    return { y, m };
  });

  const weeks = useMemo(() => {
    const first = dowMon(view.y, view.m, 1);
    const daysInMonth = new Date(view.y, view.m, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(view.y, view.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [view]);

  const shift = (n: number) => {
    const dt = new Date(view.y, view.m - 1 + n, 1);
    setView({ y: dt.getFullYear(), m: dt.getMonth() + 1 });
  };
  const disabled = (s: string) => (min && s < min) || (max && s > max);

  return (
    <div className="dp-cal">
      <div className="dp-cal-head">
        <button type="button" className="dp-nav" aria-label="Mes anterior" onClick={() => shift(-1)}>
          ‹
        </button>
        <span className="dp-cal-title">
          {MES_L[view.m - 1]} {view.y}
        </span>
        <button type="button" className="dp-nav" aria-label="Mes siguiente" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="dp-grid dp-dow">
        {DOW_HEAD.map((d, i) => (
          <span key={i} className="dp-dowc">
            {d}
          </span>
        ))}
      </div>
      {weeks.map((row, i) => (
        <div key={i} className="dp-grid">
          {row.map((s, j) =>
            s === null ? (
              <span key={j} className="dp-day dp-empty" />
            ) : (
              <button
                key={j}
                type="button"
                className={`dp-day${s === value ? ' dp-sel' : ''}${s === today ? ' dp-today' : ''}`}
                disabled={!!disabled(s)}
                onClick={() => onPick(s)}
              >
                {parts(s).d}
              </button>
            ),
          )}
        </div>
      ))}
      <div className="dp-chips">
        <button type="button" className="dp-chip" onClick={() => onPick(today)}>
          Hoy
        </button>
        <button type="button" className="dp-chip" onClick={() => onPick(addDays(today, 1))}>
          Mañana
        </button>
        <button type="button" className="dp-chip" onClick={() => onPick(addDays(today, 7))}>
          +1 semana
        </button>
      </div>
    </div>
  );
}

export function DateField({
  value,
  onChange,
  min,
  max,
  today = todayLocalYmd(),
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (ymd: string) => void;
  min?: string;
  max?: string;
  today?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="dp-wrap" ref={ref}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel ?? 'Fecha'}
        className={`field dp-trigger${value ? '' : ' dp-placeholder'}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{labelDate(value, today)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3 9h18M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="dp-panel">
          <Calendar
            value={value}
            min={min}
            max={max}
            today={today}
            onPick={(s) => {
              onChange(s);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Hora (chips + rueda) ────────────────────────────────────────────────────────
const HORAS_FREC = ['07:00', '08:00', '09:00', '12:00', '14:00', '18:00', '20:00', '21:00'];
const HH = Array.from({ length: 24 }, (_, i) => pad(i));
const MM = Array.from({ length: 12 }, (_, i) => pad(i * 5));

function Wheel({ items, value, onSelect, aria }: { items: string[]; value: string; onSelect: (v: string) => void; aria: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('.dp-wheel-on');
    el?.scrollIntoView({ block: 'center' });
  }, [value]);
  return (
    <div className="dp-wheel" role="listbox" aria-label={aria} ref={ref}>
      {items.map((it) => (
        <button
          key={it}
          type="button"
          role="option"
          aria-selected={it === value}
          className={`dp-wheel-item${it === value ? ' dp-wheel-on' : ''}`}
          onClick={() => onSelect(it)}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

function TimePanel({ value, onPick }: { value: string; onPick: (hhmm: string) => void }) {
  const [h, m] = value ? value.split(':') : ['09', '00'];
  const hh = h ?? '09';
  const mm = m ?? '00';
  // El minuto se ajusta al múltiplo de 5 más cercano para la rueda.
  const mmSnap = pad(Math.round(Number(mm) / 5) * 5 === 60 ? 55 : Math.round(Number(mm) / 5) * 5);
  return (
    <div className="dp-time">
      <div className="dp-chips dp-time-chips">
        {HORAS_FREC.map((t) => (
          <button
            key={t}
            type="button"
            className={`dp-chip${value === t ? ' dp-chip-on' : ''}`}
            onClick={() => onPick(t)}
          >
            {label12(t)}
          </button>
        ))}
      </div>
      <div className="dp-wheels">
        <Wheel items={HH} value={hh} aria="Hora" onSelect={(v) => onPick(`${v}:${mmSnap}`)} />
        <span className="dp-wheel-sep">:</span>
        <Wheel items={MM} value={mmSnap} aria="Minutos" onSelect={(v) => onPick(`${hh}:${v}`)} />
      </div>
    </div>
  );
}

export function TimeField({
  value,
  onChange,
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="dp-wrap" ref={ref}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel ?? 'Hora'}
        className={`field dp-trigger${value ? '' : ' dp-placeholder'}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label12(value)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 8v4.5l3 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="dp-panel">
          <TimePanel value={value} onPick={(t) => onChange(t)} />
        </div>
      )}
    </div>
  );
}

// ── Fecha + hora ───────────────────────────────────────────────────────────────
export function DateTimeField({
  value,
  onChange,
  min,
  max,
  today = todayLocalYmd(),
  id,
  ariaLabel,
}: {
  value: string; // 'YYYY-MM-DDTHH:MM'
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  today?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const [datePart, timePart] = value ? value.split('T') : ['', ''];
  const d = datePart ?? '';
  const t = timePart ?? '';
  const emit = (nd: string, nt: string) => onChange(`${nd || today}T${nt || '09:00'}`);
  const minD = min?.split('T')[0];
  const maxD = max?.split('T')[0];

  return (
    <div className="dp-wrap" ref={ref}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel ?? 'Fecha y hora'}
        className={`field dp-trigger${value ? '' : ' dp-placeholder'}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          {value ? `${labelDate(d, today)} · ${label12(t)}` : 'Elegir fecha y hora'}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3 9h18M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="dp-panel dp-panel-dt">
          <Calendar value={d} min={minD} max={maxD} today={today} onPick={(nd) => emit(nd, t)} />
          <div className="dp-dt-sep" />
          <TimePanel value={t} onPick={(nt) => emit(d, nt)} />
        </div>
      )}
    </div>
  );
}
