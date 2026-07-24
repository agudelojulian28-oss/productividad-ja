'use client';

import { useState, useTransition } from 'react';
import {
  completeTaskAction,
  rescheduleTaskAction,
  deleteTaskAction,
} from '@/app/actions/tasks';
import { timeInTz, dayLabelInTz } from '@/lib/format';
import type { TaskRow } from '@/core/work/ports';

export function TaskItem({
  task,
  tz,
  projectName,
}: {
  task: TaskRow;
  tz: string;
  projectName?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [due, setDue] = useState('');

  function complete() {
    startTransition(async () => void (await completeTaskAction(task.id)));
  }

  function saveReschedule() {
    if (!due) return;
    const iso = new Date(due).toISOString();
    startTransition(async () => {
      await rescheduleTaskAction(task.id, iso);
      setEditing(false);
      setDue('');
    });
  }

  const meta = [
    task.dueAt ? `${dayLabelInTz(task.dueAt, tz)} · ${timeInTz(task.dueAt, tz)}` : 'Sin fecha',
    projectName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="task" data-pending={pending}>
      <button
        className="task-check"
        aria-label="Completar tarea"
        disabled={pending}
        onClick={complete}
      />
      <div className="task-body">
        <span className="task-title">{task.title}</span>
        <span className="task-meta">{meta}</span>
        {editing && (
          <div className="new-task-row" style={{ marginTop: 8 }}>
            <input
              type="datetime-local"
              className="field"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="Nueva fecha"
            />
            <button
              type="button"
              className="btn-primary"
              onClick={saveReschedule}
              disabled={pending || !due}
            >
              Guardar
            </button>
          </div>
        )}
      </div>
      <div className="task-actions">
        <button
          type="button"
          className="linkbtn task-action"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Cancelar' : 'Reprog.'}
        </button>
        <button
          type="button"
          className="linkbtn task-action task-delete"
          disabled={pending}
          onClick={() => startTransition(async () => void (await deleteTaskAction(task.id)))}
        >
          Borrar
        </button>
      </div>
    </li>
  );
}
