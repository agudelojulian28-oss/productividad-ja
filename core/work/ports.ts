// Puerto de datos del módulo work. core define la interfaz; adapters/supabase la implementa.
// core no sabe que detrás hay Supabase.

export type TaskStatus = 'pending' | 'done' | 'cancelled';

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  dueAt: string | null; // ISO
  completedAt: string | null; // ISO
  projectId: string | null;
  goalId: string | null;
  origin: string | null;
  googleCalendarId: string | null;
  googleEventId: string | null;
}

export interface TaskInsert {
  title: string;
  notes?: string;
  projectId?: string;
  goalId?: string;
  dueAt?: string; // ISO
  origin: 'manual' | 'agente' | 'playbook';
}

export interface TaskPatch {
  title?: string;
  notes?: string | null;
  status?: TaskStatus;
  dueAt?: string | null;
  completedAt?: string | null;
  goalId?: string | null;
  googleCalendarId?: string | null;
  googleEventId?: string | null;
}

export interface TaskFilter {
  status?: TaskStatus;
  dueFrom?: string; // ISO (inclusive)
  dueTo?: string; // ISO (inclusive)
}

export interface ProjectRow {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'archived' | 'done';
  areaId: string | null;
  description: string | null;
}

export interface GoalRow {
  id: string;
  projectId: string | null;
  title: string;
  status: 'active' | 'achieved' | 'missed' | 'archived';
  description: string | null;
}

export interface GoalInsert {
  projectId: string;
  title: string;
  /** Zona del usuario para fijar el periodo por defecto (YYYY-MM-DD calculado en el repo). */
  tz: string;
}

export interface WorkRepo {
  insertTask(input: TaskInsert): Promise<TaskRow>;
  listTasks(filter: TaskFilter): Promise<TaskRow[]>;
  getTask(id: string): Promise<TaskRow | null>;
  updateTask(id: string, patch: TaskPatch): Promise<TaskRow>;
  deleteTask(id: string): Promise<void>;
  searchTasks(text: string): Promise<TaskRow[]>;

  listProjects(areaId?: string): Promise<ProjectRow[]>;
  getProject(id: string): Promise<ProjectRow | null>;
  insertProject(input: { title: string; areaId: string }): Promise<ProjectRow>;
  updateProject(id: string, patch: { description?: string | null }): Promise<ProjectRow>;

  listGoals(projectId: string): Promise<GoalRow[]>;
  getGoal(id: string): Promise<GoalRow | null>;
  insertGoal(input: GoalInsert): Promise<GoalRow>;
  updateGoal(id: string, patch: { description?: string | null }): Promise<GoalRow>;
}
