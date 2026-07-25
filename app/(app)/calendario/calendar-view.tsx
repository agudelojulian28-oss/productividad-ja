'use client';

import { useEffect, useState } from 'react';
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

  // Arrastre solo en punteros finos (escritorio); en táctil, tocar para editar.
  useEffect(() => {
    setCanDrag(window.matchMedia('(pointer: fine)').matches);
  }, []);

  function push(v: CalView, d: string) {
    router.push(`/calendario?view=${v}&date=${d}`);
  }
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
    <div className="cal">
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
