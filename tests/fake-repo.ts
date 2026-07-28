// Repositorio en memoria para probar los casos de uso de /core sin base de datos.
// Implementa el puerto WorkRepo; la aritmética real vive en el dominio.

import type {
  WorkRepo,
  TaskRow,
  TaskInsert,
  TaskPatch,
  TaskFilter,
  ProjectRow,
  GoalRow,
  GoalInsert,
  GoalPatch,
} from '@/core/work/ports';
import type { ActorContext } from '@/core/types';

export function makeFakeRepo(): WorkRepo & {
  _tasks: Map<string, TaskRow>;
  _projects: Map<string, ProjectRow>;
  _goals: Map<string, GoalRow>;
} {
  const tasks = new Map<string, TaskRow>();
  const projects = new Map<string, ProjectRow>();
  const goals = new Map<string, GoalRow>();
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    _tasks: tasks,
    _projects: projects,
    _goals: goals,
    async insertTask(input: TaskInsert): Promise<TaskRow> {
      const row: TaskRow = {
        id: uuid(),
        title: input.title,
        notes: input.notes ?? null,
        status: 'pending',
        dueAt: input.dueAt ?? null,
        completedAt: null,
        projectId: input.projectId ?? null,
        goalId: input.goalId ?? null,
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
        if (filter.goalId && t.goalId !== filter.goalId) return false;
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
    async listProjects(areaId?: string): Promise<ProjectRow[]> {
      return [...projects.values()].filter((p) => !areaId || p.areaId === areaId);
    },
    async getProject(id: string): Promise<ProjectRow | null> {
      return projects.get(id) ?? null;
    },
    async insertProject(input: { title: string; areaId: string }): Promise<ProjectRow> {
      const row: ProjectRow = {
        id: uuid(),
        title: input.title,
        status: 'active',
        areaId: input.areaId,
        description: null,
      };
      projects.set(row.id, row);
      return row;
    },
    async updateProject(id: string, patch: { description?: string | null }): Promise<ProjectRow> {
      const cur = projects.get(id);
      if (!cur) throw new Error('updateProject: no existe');
      const next: ProjectRow = { ...cur, ...patch };
      projects.set(id, next);
      return next;
    },
    async listGoals(projectId: string): Promise<GoalRow[]> {
      return [...goals.values()].filter((g) => g.projectId === projectId);
    },
    async getGoal(id: string): Promise<GoalRow | null> {
      return goals.get(id) ?? null;
    },
    async insertGoal(input: GoalInsert): Promise<GoalRow> {
      const row: GoalRow = {
        id: uuid(),
        projectId: input.projectId,
        title: input.title,
        status: 'active',
        description: null,
        targetValue: input.targetValue ?? 1,
        periodStart: '2026-01-01',
        periodEnd: input.deadline ?? '2027-01-01',
      };
      goals.set(row.id, row);
      return row;
    },
    async updateGoal(id: string, patch: GoalPatch): Promise<GoalRow> {
      const cur = goals.get(id);
      if (!cur) throw new Error('updateGoal: no existe');
      const next: GoalRow = { ...cur, ...patch };
      goals.set(id, next);
      return next;
    },
  };
}

export function ctx(over: Partial<ActorContext> = {}): ActorContext {
  return { userId: 'u1', actor: 'user', channel: 'web', tz: 'America/Bogota', ...over };
}
