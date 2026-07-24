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
}

export interface TaskFilter {
  status?: TaskStatus;
  dueFrom?: string; // ISO (inclusive)
  dueTo?: string; // ISO (inclusive)
}

export interface WorkRepo {
  insertTask(input: TaskInsert): Promise<TaskRow>;
  listTasks(filter: TaskFilter): Promise<TaskRow[]>;
  getTask(id: string): Promise<TaskRow | null>;
  updateTask(id: string, patch: TaskPatch): Promise<TaskRow>;
}
