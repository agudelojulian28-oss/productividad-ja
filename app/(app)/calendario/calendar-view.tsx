'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimeGrid } from './time-grid';
import { MonthGrid } from './month-grid';
import { EventEditor, type EditorTarget } from './event-editor';

export type CalView = 'dia' | 'semana' | 'mes';

export type CalItem = {
  kind: 'event' | 'task';
  id: string;
  title: string;
  start: string | null; // ISO
  end: string | null; // ISO
  allDay: boolean;
  colorId: string | null;
};

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonthsYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Etiqueta de una fecha-calendario (sin instante), estable en cualquier zona. */
function labelYmd(ymd: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', ...opts }).format(
    new Date(`${ymd}T12:00:00Z`),
  );
}

const VIEWS: { key: CalView; label: string }[] = [
  { key: 'dia', label: 'Día' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
];

export function CalendarView({
  view,
  date,
  today,
  tz,
  items,
  days,
}: {
  view: CalView;
  date: string;
  today: string;
  tz: string;
  items: CalItem[];
  days: string[];
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [canDrag, setCanDrag] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const lastZoom = useRef(0);

  // Arrastre solo en punteros finos (escritorio); en táctil, tocar para editar.
  useEffect(() => {
    setCanDrag(window.matchMedia('(pointer: fine)').matches);
  }, []);

  function push(v: CalView, d: string) {
    router.push(`/calendario?view=${v}&date=${d}`);
  }

  // Zoom: pellizcar (o ctrl+rueda / pinch de trackpad) salta entre Mes ⇄ Semana ⇄ Día.
  const ZOOM_ORDER: CalView[] = ['mes', 'semana', 'dia'];
  function zoom(dir: 1 | -1) {
    const now = Date.now();
    if (now - lastZoom.current < 450) return;
    const i = ZOOM_ORDER.indexOf(view);
    const ni = i + dir;
    if (ni < 0 || ni >= ZOOM_ORDER.length) return;
    lastZoom.current = now;
    push(ZOOM_ORDER[ni]!, date);
  }
  function twoFingerDist(): number | null {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return Math.hypot(a!.x - b!.x, a!.y - b!.y);
  }
  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchDist.current = twoFingerDist();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchDist.current) {
      const d = twoFingerDist();
      if (!d) return;
      const r = d / pinchDist.current;
      if (r > 1.3) {
        zoom(1);
        pinchDist.current = d;
      } else if (r < 0.77) {
        zoom(-1);
        pinchDist.current = d;
      }
    }
  }
  function onPointerUpCal(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
  }

  // ctrl + rueda (y pinch de trackpad, que el navegador emite como ctrl+wheel).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1 : -1);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);
  function shift(dir: -1 | 1) {
    const d =
      view === 'dia'
        ? addDaysYmd(date, dir)
        : view === 'semana'
          ? addDaysYmd(date, 7 * dir)
          : addMonthsYmd(date, dir);
    push(view, d);
  }

  let title: string;
  if (view === 'dia') title = labelYmd(date, { weekday: 'long', day: 'numeric', month: 'long' });
  else if (view === 'semana') {
    const a = days[0]!;
    const b = days[days.length - 1]!;
    title = `${labelYmd(a, { day: 'numeric', month: 'short' })} – ${labelYmd(b, { day: 'numeric', month: 'short' })}`;
  } else title = labelYmd(date, { month: 'long', year: 'numeric' });

  return (
    <div
      className="cal"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUpCal}
      onPointerCancel={onPointerUpCal}
    >
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="cal-arrow" aria-label="Anterior" onClick={() => shift(-1)}>
            ‹
          </button>
          <button className="cal-today" onClick={() => push(view, today)}>
            Hoy
          </button>
          <button className="cal-arrow" aria-label="Siguiente" onClick={() => shift(1)}>
            ›
          </button>
          <button className="cal-refresh" aria-label="Actualizar" onClick={() => router.refresh()}>
            ⟳
          </button>
        </div>
        <span className="cal-title">{title}</span>
        <div className="cal-views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={`cal-viewbtn${view === v.key ? ' cal-viewbtn-active' : ''}`}
              onClick={() => push(v.key, date)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'mes' ? (
        <MonthGrid
          days={days}
          month={date.slice(0, 7)}
          today={today}
          tz={tz}
          items={items}
          onDay={(d) => push('dia', d)}
          onItem={(it) =>
            setEditor(it.kind === 'task' ? { mode: 'task', item: it } : { mode: 'event', item: it })
          }
        />
      ) : (
        <TimeGrid
          days={days}
          today={today}
          tz={tz}
          items={items}
          canDrag={canDrag}
          onItem={(it) =>
            setEditor(it.kind === 'task' ? { mode: 'task', item: it } : { mode: 'event', item: it })
          }
          onSlot={(iso) => setEditor({ mode: 'create', slotIso: iso })}
          onChanged={() => router.refresh()}
        />
      )}

      {editor && (
        <EventEditor
          target={editor}
          tz={tz}
          onClose={() => setEditor(null)}
          onDone={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
