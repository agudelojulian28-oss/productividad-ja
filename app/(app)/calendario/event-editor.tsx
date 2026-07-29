'use client';

import { useState, useTransition } from 'react';
import {
  createEventAction,
  editEventAction,
  deleteEventAction,
} from '@/app/actions/events';
import {
  completeTaskAction,
  deleteTaskAction,
  rescheduleTaskAction,
} from '@/app/actions/tasks';
import { COLOR_NAMES, nameToColorId, hexForColorId } from '@/lib/calendar-colors';
import type { CalItem } from './calendar-view';

export type EditorTarget =
  | { mode: 'create'; slotIso: string }
  | { mode: 'event'; item: CalItem }
  | { mode: 'task'; item: CalItem };

const DURATIONS = [
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 60, label: '1 h' },
  { min: 90, label: '1 h 30' },
  { min: 120, label: '2 h' },
];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function durationOf(item: CalItem): number {
  if (item.start && item.end) {
    const d = (new Date(item.end).getTime() - new Date(item.start).getTime()) / 60000;
    if (d > 0) return d;
  }
  return 30;
}

export function EventEditor({
  target,
  projects,
  goalsByProject,
  onClose,
  onDone,
}: {
  target: EditorTarget;
  tz: string;
  projects: { id: string; title: string }[];
  goalsByProject: Record<string, { id: string; title: string }[]>;
  onClose: () => void;
  onDone: () => void;
}) {
  const isTask = target.mode === 'task';
  const item = target.mode === 'create' ? null : target.item;

  const [titulo, setTitulo] = useState(item?.title ?? '');
  const [when, setWhen] = useState(
    target.mode === 'create'
      ? toLocalInput(target.slotIso)
      : item?.start
        ? toLocalInput(item.start)
        : '',
  );
  const [durMin, setDurMin] = useState(item ? durationOf(item) : 30);
  const [colorId, setColorId] = useState<string | null>(item?.colorId ?? null);
  const [descripcion, setDescripcion] = useState(item?.description ?? '');
  const [proyecto, setProyecto] = useState(item?.projectId ?? '');
  const [meta, setMeta] = useState(item?.goalId ?? '');
  const [pending, startTransition] = useTransition();

  const metasDelProyecto = proyecto ? (goalsByProject[proyecto] ?? []) : [];

  const iso = () => (when ? new Date(when).toISOString() : undefined);

  function createEvent() {
    const fecha = iso();
    if (!titulo.trim() || !fecha) return;
    startTransition(async () => {
      await createEventAction({
        titulo: titulo.trim(),
        fecha,
        colorId: colorId ?? undefined,
        durationMin: durMin,
        descripcion: descripcion.trim() || undefined,
        projectId: proyecto || undefined,
        goalId: meta || undefined,
      });
      onDone();
    });
  }

  function saveEvent() {
    if (!item) return;
    startTransition(async () => {
      await editEventAction(item.id, {
        titulo: titulo.trim() || undefined,
        fecha: iso(),
        colorId: colorId ?? undefined,
        durationMin: durMin,
        descripcion: descripcion.trim() || null,
        projectId: proyecto || null,
        goalId: meta || null,
      });
      onDone();
    });
  }

  function removeEvent() {
    if (!item) return;
    startTransition(async () => {
      await deleteEventAction(item.id);
      onDone();
    });
  }

  function rescheduleTask() {
    if (!item) return;
    const fecha = iso();
    if (!fecha) return;
    startTransition(async () => {
      await rescheduleTaskAction(item.id, fecha);
      onDone();
    });
  }

  function completeTask() {
    if (!item) return;
    startTransition(async () => {
      await completeTaskAction(item.id);
      onDone();
    });
  }

  function removeTask() {
    if (!item) return;
    startTransition(async () => {
      await deleteTaskAction(item.id);
      onDone();
    });
  }

  const heading =
    target.mode === 'create' ? 'Nuevo evento' : isTask ? 'Tarea' : 'Editar evento';

  return (
    <div className="cal-modal-overlay" onClick={onClose}>
      <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-modal-head">
          <h2>{heading}</h2>
          <button className="linkbtn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {isTask ? (
          <>
            <p className="cal-modal-tasktitle">{titulo}</p>
            <label className="cal-field-label">
              Reprogramar
              <input
                type="datetime-local"
                className="field"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
            <div className="cal-modal-actions">
              <button className="btn-primary" onClick={rescheduleTask} disabled={pending || !when}>
                Guardar hora
              </button>
              <button className="linkbtn" onClick={completeTask} disabled={pending}>
                Completar
              </button>
              <button
                className="linkbtn task-delete"
                onClick={removeTask}
                disabled={pending}
              >
                Borrar
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="cal-field-label">
              Título
              <input
                type="text"
                className="field"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título del evento"
              />
            </label>
            <label className="cal-field-label">
              Inicio
              <input
                type="datetime-local"
                className="field"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
            <label className="cal-field-label">
              Duración
              <select
                className="field"
                value={durMin}
                onChange={(e) => setDurMin(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d.min} value={d.min}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="cal-field-label">
              Color
              <div className="color-picker">
                {COLOR_NAMES.map((name) => {
                  const id = nameToColorId[name];
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`color-swatch${colorId === id ? ' color-swatch-on' : ''}`}
                      title={name}
                      aria-label={`Color ${name}`}
                      style={{ background: hexForColorId(id) }}
                      onClick={() => setColorId(id)}
                    />
                  );
                })}
              </div>
            </div>
            <label className="cal-field-label">
              Descripción
              <textarea
                className="field"
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Notas del evento…"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>
            {projects.length > 0 && (
              <>
                <label className="cal-field-label">
                  Proyecto (opcional)
                  <select
                    className="field"
                    value={proyecto}
                    onChange={(e) => {
                      setProyecto(e.target.value);
                      setMeta('');
                    }}
                  >
                    <option value="">Sin proyecto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                {metasDelProyecto.length > 0 && (
                  <label className="cal-field-label">
                    Meta (opcional)
                    <select
                      className="field"
                      value={meta}
                      onChange={(e) => setMeta(e.target.value)}
                    >
                      <option value="">Sin meta</option>
                      {metasDelProyecto.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <div className="cal-modal-actions">
              {target.mode === 'create' ? (
                <button
                  className="btn-primary"
                  onClick={createEvent}
                  disabled={pending || !titulo.trim() || !when}
                >
                  Crear
                </button>
              ) : (
                <>
                  <button className="btn-primary" onClick={saveEvent} disabled={pending}>
                    Guardar
                  </button>
                  <button
                    className="linkbtn task-delete"
                    onClick={removeEvent}
                    disabled={pending}
                  >
                    Borrar
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
