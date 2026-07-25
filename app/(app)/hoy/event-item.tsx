'use client';

import { useState, useTransition } from 'react';
import { editEventAction, deleteEventAction } from '@/app/actions/events';
import { timeInTz } from '@/lib/format';
import {
  COLOR_NAMES,
  nameToColorId,
  hexForColorId,
  type ColorName,
} from '@/lib/calendar-colors';

type CalEvent = {
  id: string;
  summary: string;
  start: string | null;
  allDay: boolean;
  colorId: string | null;
};

export function EventItem({ event, tz }: { event: CalEvent; tz: string }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'none' | 'time' | 'color'>('none');
  const [when, setWhen] = useState('');

  function saveTime() {
    if (!when) return;
    const iso = new Date(when).toISOString();
    startTransition(async () => {
      await editEventAction(event.id, { fecha: iso });
      setMode('none');
      setWhen('');
    });
  }

  function setColor(name: ColorName) {
    startTransition(async () => {
      await editEventAction(event.id, { colorId: nameToColorId[name] });
      setMode('none');
    });
  }

  function remove() {
    startTransition(async () => void (await deleteEventAction(event.id)));
  }

  return (
    <li className="event-row" data-pending={pending}>
      <span className="event-dot" style={{ background: hexForColorId(event.colorId) }} />
      <div className="task-body">
        <span className="task-title">{event.summary}</span>
        <span className="task-meta">
          {event.allDay || !event.start ? 'Todo el día' : timeInTz(event.start, tz)}
        </span>

        {mode === 'time' && (
          <div className="new-task-row" style={{ marginTop: 8 }}>
            <input
              type="datetime-local"
              className="field"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label="Nueva hora"
            />
            <button
              type="button"
              className="btn-primary"
              onClick={saveTime}
              disabled={pending || !when}
            >
              Guardar
            </button>
          </div>
        )}

        {mode === 'color' && (
          <div className="color-picker" style={{ marginTop: 8 }}>
            {COLOR_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className="color-swatch"
                title={name}
                aria-label={`Color ${name}`}
                disabled={pending}
                style={{ background: hexForColorId(nameToColorId[name]) }}
                onClick={() => setColor(name)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="task-actions">
        <button
          type="button"
          className="linkbtn task-action"
          onClick={() => setMode((m) => (m === 'time' ? 'none' : 'time'))}
        >
          {mode === 'time' ? 'Cancelar' : 'Reprog.'}
        </button>
        <button
          type="button"
          className="linkbtn task-action"
          onClick={() => setMode((m) => (m === 'color' ? 'none' : 'color'))}
        >
          {mode === 'color' ? 'Cancelar' : 'Color'}
        </button>
        <button
          type="button"
          className="linkbtn task-action task-delete"
          disabled={pending}
          onClick={remove}
        >
          Borrar
        </button>
      </div>
    </li>
  );
}
