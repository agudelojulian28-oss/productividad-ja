'use client';

import { useEffect, useRef, useState } from 'react';
import { editEventAction } from '@/app/actions/events';
import { rescheduleTaskAction } from '@/app/actions/tasks';
import { minutesInTz, dateInTz, timeInTz } from '@/lib/format';
import { hexForColorId } from '@/lib/calendar-colors';
import type { CalItem } from './calendar-view';

const HOUR_H = 44; // px por hora
const PX_PER_MIN = HOUR_H / 60;
const SNAP = 15; // min
const DEFAULT_DUR = 30; // min si el ítem no tiene fin
const DAY_MS = 86_400_000;

function durationMin(it: CalItem): number {
  if (it.start && it.end) {
    const d = (new Date(it.end).getTime() - new Date(it.start).getTime()) / 60000;
    if (d > 0) return d;
  }
  return DEFAULT_DUR;
}

function itemHex(it: CalItem): string {
  return it.kind === 'task' ? 'var(--accent)' : hexForColorId(it.colorId);
}

/** Día (YYYY-MM-DD) al que pertenece el ítem, en la zona del usuario.
 *  Los de todo el día ya vienen como fecha pura: no reinterpretar como instante. */
function dayOf(it: CalItem, tz: string): string | null {
  if (!it.start) return null;
  return it.allDay ? it.start.slice(0, 10) : dateInTz(it.start, tz);
}

type Drag = {
  id: string;
  kind: 'event' | 'task';
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origStartMs: number;
  origDurMin: number;
  colWidth: number;
  dx: number;
  dy: number;
};

export function TimeGrid({
  days,
  today,
  tz,
  items,
  canDrag,
  onItem,
  onSlot,
  onChanged,
}: {
  days: string[];
  today: string;
  tz: string;
  items: CalItem[];
  canDrag: boolean;
  onItem: (it: CalItem) => void;
  onSlot: (iso: string) => void;
  onChanged: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 7 * HOUR_H;
  }, []);

  // Arrastre: escuchar en window mientras haya un drag activo.
  useEffect(() => {
    if (!drag) return;
    function move(e: PointerEvent) {
      setDrag((d) => {
        if (!d) return d;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
        return { ...d, dx, dy };
      });
    }
    function up() {
      setDrag((d) => {
        if (d) commitDrag(d);
        return null;
      });
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  function commitDrag(d: Drag) {
    const snapMin = (px: number) => Math.round(px / PX_PER_MIN / SNAP) * SNAP;
    if (d.mode === 'resize') {
      const newDur = Math.max(SNAP, d.origDurMin + snapMin(d.dy));
      if (newDur === d.origDurMin) return;
      setSaving(true);
      void editEventAction(d.id, { durationMin: newDur }).then(() => {
        setSaving(false);
        onChanged();
      });
      return;
    }
    const deltaDays = days.length > 1 && d.colWidth > 0 ? Math.round(d.dx / d.colWidth) : 0;
    const deltaMin = snapMin(d.dy);
    if (deltaDays === 0 && deltaMin === 0) return;
    const newIso = new Date(d.origStartMs + deltaDays * DAY_MS + deltaMin * 60000).toISOString();
    setSaving(true);
    const p =
      d.kind === 'task'
        ? rescheduleTaskAction(d.id, newIso)
        : editEventAction(d.id, { fecha: newIso });
    void p.then(() => {
      setSaving(false);
      onChanged();
    });
  }

  function startDrag(e: React.PointerEvent, it: CalItem, mode: 'move' | 'resize') {
    if (!canDrag || !it.start) return;
    e.stopPropagation();
    e.preventDefault();
    movedRef.current = false;
    setDrag({
      id: it.id,
      kind: it.kind,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origStartMs: new Date(it.start).getTime(),
      origDurMin: durationMin(it),
      colWidth: colsRef.current ? colsRef.current.clientWidth / days.length : 0,
      dx: 0,
      dy: 0,
    });
  }

  function createAt(day: string, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const min = Math.max(0, Math.min(23 * 60 + 45, Math.round(y / PX_PER_MIN / SNAP) * SNAP));
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    onSlot(new Date(`${day}T${hh}:${mm}:00`).toISOString());
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const timed = items.filter((it) => it.start && !it.allDay);
  const allDay = items.filter((it) => it.allDay || !it.start);

  return (
    <div className="tg">
      <div className="tg-head">
        <div className="tg-corner" />
        {days.map((d) => (
          <div key={d} className={`tg-daylabel${d === today ? ' tg-today' : ''}`}>
            <span className="tg-dow">
              {new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'short' }).format(
                new Date(`${d}T12:00:00Z`),
              )}
            </span>
            <span className="tg-dnum">{Number(d.slice(8, 10))}</span>
          </div>
        ))}
      </div>

      {allDay.length > 0 && (
        <div className="tg-allday">
          <div className="tg-corner tg-allday-label">todo el día</div>
          {days.map((day) => (
            <div key={day} className="tg-allday-cell">
              {allDay
                .filter((it) => dayOf(it, tz) === day)
                .map((it) => (
                  <button
                    key={it.kind + it.id}
                    className="tg-allday-pill"
                    style={{ background: itemHex(it) }}
                    onClick={() => onItem(it)}
                    title={it.title}
                  >
                    {it.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="tg-body" ref={bodyRef}>
        <div className="tg-hours" style={{ height: 24 * HOUR_H }}>
          {hours.map((h) => (
            <div key={h} className="tg-hour" style={{ height: HOUR_H }}>
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        <div className="tg-cols" ref={colsRef} style={{ height: 24 * HOUR_H }}>
          {days.map((day) => (
            <div
              key={day}
              className="tg-col"
              onClick={(e) => {
                if (e.target === e.currentTarget) createAt(day, e);
              }}
            >
              {hours.map((h) => (
                <div key={h} className="tg-slot" style={{ top: h * HOUR_H, height: HOUR_H }} />
              ))}
              {timed
                .filter((it) => dayOf(it, tz) === day)
                .map((it) => {
                  const startMin = minutesInTz(it.start!, tz);
                  const dur = durationMin(it);
                  const isDragged = drag?.id === it.id;
                  const dOff = isDragged ? drag! : null;
                  const extraH = dOff?.mode === 'resize' ? dOff.dy : 0;
                  const moveX = dOff?.mode === 'move' ? dOff.dx : 0;
                  const moveY = dOff?.mode === 'move' ? dOff.dy : 0;
                  return (
                    <div
                      key={it.kind + it.id}
                      className={`tg-block${it.kind === 'task' ? ' tg-task' : ''}${isDragged ? ' tg-dragging' : ''}`}
                      style={{
                        top: startMin * PX_PER_MIN,
                        height: Math.max(18, dur * PX_PER_MIN + extraH),
                        borderLeftColor: itemHex(it),
                        transform: `translate(${moveX}px, ${moveY}px)`,
                      }}
                      onPointerDown={(e) => startDrag(e, it, 'move')}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (movedRef.current) {
                          movedRef.current = false;
                          return;
                        }
                        onItem(it);
                      }}
                    >
                      <span className="tg-block-time">{timeInTz(it.start!, tz)}</span>
                      <span className="tg-block-title">{it.title}</span>
                      {canDrag && it.kind === 'event' && (
                        <span
                          className="tg-resize"
                          onPointerDown={(e) => startDrag(e, it, 'resize')}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      {saving && <div className="cal-saving">Guardando…</div>}
    </div>
  );
}
