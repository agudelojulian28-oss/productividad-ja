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
  origin: string | null;
  googleCalendarId: string | null;
  googleEventId: string | null;
}

export interface TaskInsert {
  title: string;
  notes?: string;
  projectId?: string;
  dueAt?: string; // ISO
  origin: 'manual' | 'agente' | 'playbook';
}

export interface TaskPatch {
  title?: string;
  notes?: string | null;
  status?: TaskStatus;
  dueAt?: string | null;
  completedAt?: string | null;
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
}

export interface WorkRepo {
  insertTask(input: TaskInsert): Promise<TaskRow>;
  listTasks(filter: TaskFilter): Promise<TaskRow[]>;
  getTask(id: string): Promise<TaskRow | null>;
  updateTask(id: string, patch: TaskPatch): Promise<TaskRow>;
  deleteTask(id: string): Promise<void>;

  listProjects(areaId?: string): Promise<ProjectRow[]>;
  getProject(id: string): Promise<ProjectRow | null>;
  insertProject(input: { title: string; areaId: string }): Promise<ProjectRow>;
}
