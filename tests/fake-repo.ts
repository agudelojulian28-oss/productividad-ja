// Repositorio en memoria para probar los casos de uso de /core sin base de datos.
// Implementa el puerto WorkRepo; la aritmética real vive en el dominio.

import type {
  WorkRepo,
  TaskRow,
  TaskInsert,
  TaskPatch,
  TaskFilter,
  ProjectRow,
} from '@/core/work/ports';
import type { ActorContext } from '@/core/types';

export function makeFakeRepo(): WorkRepo & { _tasks: Map<string, TaskRow> } {
  const tasks = new Map<string, TaskRow>();
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    _tasks: tasks,
    async insertTask(input: TaskInsert): Promise<TaskRow> {
      const row: TaskRow = {
        id: uuid(),
        title: input.title,
        notes: input.notes ?? null,
        status: 'pending',
        dueAt: input.dueAt ?? null,
        completedAt: null,
        projectId: input.projectId ?? null,
        origin: input.origin,
        googleCalendarId: null,
        googleEventId: null,
      };
      tasks.set(row.id, row);
      return row;
    },
    async listTasks(filter: TaskFilter): Promise<TaskRow[]> {
      return [...tasks.values()].filter((t) => {
        if (filter.status && t.status !== filter.status) return false;
        if (filter.dueFrom && (!t.dueAt || t.dueAt < filter.dueFrom)) return false;
        if (filter.dueTo && (!t.dueAt || t.dueAt > filter.dueTo)) return false;
        return true;
      });
    },
    async getTask(id: string): Promise<TaskRow | null> {
      return tasks.get(id) ?? null;
    },
    async updateTask(id: string, patch: TaskPatch): Promise<TaskRow> {
      const cur = tasks.get(id);
      if (!cur) throw new Error('updateTask: no existe ' + id);
      const next: TaskRow = { ...cur, ...patch };
      tasks.set(id, next);
      return next;
    },
    async deleteTask(id: string): Promise<void> {
      tasks.delete(id);
    },
    async searchTasks(text: string): Promise<TaskRow[]> {
      const q = text.toLowerCase();
      return [...tasks.values()].filter((t) => t.title.toLowerCase().includes(q));
    },
    async listProjects(): Promise<ProjectRow[]> {
      return [];
    },
    async getProject(): Promise<ProjectRow | null> {
      return null;
    },
    async insertProject(): Promise<ProjectRow> {
      throw new Error('insertProject no implementado en el fake');
    },
  };
}

export function ctx(over: Partial<ActorContext> = {}): ActorContext {
  return { userId: 'u1', actor: 'user', channel: 'web', tz: 'America/Bogota', ...over };
}
