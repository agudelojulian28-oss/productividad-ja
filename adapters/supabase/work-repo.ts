import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkRepo, TaskRow, TaskStatus, ProjectRow } from '@/core/work/ports';

interface DbTask {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  project_id: string | null;
  origin: string | null;
}

const COLS = 'id,title,notes,status,due_at,completed_at,project_id,origin';

function toRow(r: DbTask): TaskRow {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    status: r.status,
    dueAt: r.due_at,
    completedAt: r.completed_at,
    projectId: r.project_id,
    origin: r.origin,
  };
}

interface DbProject {
  id: string;
  title: string;
  status: ProjectRow['status'];
  area_id: string | null;
}

const PROJECT_COLS = 'id,title,status,area_id';

function toProject(r: DbProject): ProjectRow {
  return { id: r.id, title: r.title, status: r.status, areaId: r.area_id };
}

/** Implementación del puerto WorkRepo sobre Supabase. Usa la sesión del usuario:
 *  RLS garantiza que solo toca sus propias filas. */
export function workRepo(supabase: SupabaseClient, userId: string): WorkRepo {
  return {
    async insertTask(input) {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: input.title,
          notes: input.notes ?? null,
          project_id: input.projectId ?? null,
          due_at: input.dueAt ?? null,
          origin: input.origin,
        })
        .select(COLS)
        .single();
      if (error) throw new Error(error.message);
      return toRow(data as DbTask);
    },

    async listTasks(filter) {
      let q = supabase.from('tasks').select(COLS);
      if (filter.status) q = q.eq('status', filter.status);
      if (filter.dueFrom) q = q.gte('due_at', filter.dueFrom);
      if (filter.dueTo) q = q.lte('due_at', filter.dueTo);
      const { data, error } = await q.order('due_at', { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return ((data as DbTask[] | null) ?? []).map(toRow);
    },

    async getTask(id) {
      const { data, error } = await supabase
        .from('tasks')
        .select(COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toRow(data as DbTask) : null;
    },

    async updateTask(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.title !== undefined) upd.title = patch.title;
      if (patch.notes !== undefined) upd.notes = patch.notes;
      if (patch.status !== undefined) upd.status = patch.status;
      if (patch.dueAt !== undefined) upd.due_at = patch.dueAt;
      if (patch.completedAt !== undefined) upd.completed_at = patch.completedAt;
      const { data, error } = await supabase
        .from('tasks')
        .update(upd)
        .eq('id', id)
        .select(COLS)
        .single();
      if (error) throw new Error(error.message);
      return toRow(data as DbTask);
    },

    async listProjects(areaId) {
      let q = supabase.from('projects').select(PROJECT_COLS).neq('status', 'archived');
      if (areaId) q = q.eq('area_id', areaId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as DbProject[] | null) ?? []).map(toProject);
    },

    async getProject(id) {
      const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toProject(data as DbProject) : null;
    },

    async insertProject(input) {
      const { data, error } = await supabase
        .from('projects')
        .insert({ user_id: userId, title: input.title, area_id: input.areaId })
        .select(PROJECT_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toProject(data as DbProject);
    },
  };
}
