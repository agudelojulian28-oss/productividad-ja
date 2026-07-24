'use client';

import { useTransition } from 'react';
import { completeTaskAction } from '@/app/actions/tasks';
import { timeInTz, dayLabelInTz } from '@/lib/format';
import type { TaskRow } from '@/core/work/ports';

export function TaskItem({ task, tz }: { task: TaskRow; tz: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="task" data-pending={pending}>
      <button
        className="task-check"
        aria-label="Completar tarea"
        disabled={pending}
        onClick={() => startTransition(async () => void (await completeTaskAction(task.id)))}
      />
      <div className="task-body">
        <span className="task-title">{task.title}</span>
        {task.dueAt && (
          <span className="task-meta">
            {dayLabelInTz(task.dueAt, tz)} · {timeInTz(task.dueAt, tz)}
          </span>
        )}
      </div>
    </li>
  );
}
