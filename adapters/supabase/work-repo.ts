import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkRepo, TaskRow, TaskStatus, ProjectRow, GoalRow } from '@/core/work/ports';

interface DbTask {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  project_id: string | null;
  goal_id: string | null;
  origin: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
}

const COLS =
  'id,title,notes,status,due_at,completed_at,project_id,goal_id,origin,google_calendar_id,google_event_id';

function toRow(r: DbTask): TaskRow {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    status: r.status,
    dueAt: r.due_at,
    completedAt: r.completed_at,
    projectId: r.project_id,
    goalId: r.goal_id,
    origin: r.origin,
    googleCalendarId: r.google_calendar_id,
    googleEventId: r.google_event_id,
  };
}

interface DbProject {
  id: string;
  title: string;
  status: ProjectRow['status'];
  area_id: string | null;
  description: string | null;
}

const PROJECT_COLS = 'id,title,status,area_id,description';

function toProject(r: DbProject): ProjectRow {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    areaId: r.area_id,
    description: r.description,
  };
}

interface DbGoal {
  id: string;
  project_id: string | null;
  title: string;
  status: GoalRow['status'];
  description: string | null;
  target_value: number | string;
  period_start: string;
  period_end: string;
}

const GOAL_COLS = 'id,project_id,title,status,description,target_value,period_start,period_end';

function toGoal(r: DbGoal): GoalRow {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status,
    description: r.description,
    targetValue: Number(r.target_value),
    periodStart: r.period_start,
    periodEnd: r.period_end,
  };
}

/** Fecha local (YYYY-MM-DD) en la zona del usuario. */
function ymdInTz(tz: string, addYears = 0): string {
  const d = new Date();
  if (addYears) d.setFullYear(d.getFullYear() + addYears);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
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
          goal_id: input.goalId ?? null,
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
      if (filter.goalId) q = q.eq('goal_id', filter.goalId);
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
      if (patch.goalId !== undefined) upd.goal_id = patch.goalId;
      if (patch.googleCalendarId !== undefined) upd.google_calendar_id = patch.googleCalendarId;
      if (patch.googleEventId !== undefined) upd.google_event_id = patch.googleEventId;
      const { data, error } = await supabase
        .from('tasks')
        .update(upd)
        .eq('id', id)
        .select(COLS)
        .single();
      if (error) throw new Error(error.message);
      return toRow(data as DbTask);
    },

    async deleteTask(id) {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async searchTasks(text) {
      const { data, error } = await supabase
        .from('tasks')
        .select(COLS)
        .ilike('title', `%${text}%`)
        .neq('status', 'cancelled')
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return ((data as DbTask[] | null) ?? []).map(toRow);
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

    async updateProject(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.description !== undefined) upd.description = patch.description;
      const { data, error } = await supabase
        .from('projects')
        .update(upd)
        .eq('id', id)
        .select(PROJECT_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toProject(data as DbProject);
    },

    async listGoals(projectId) {
      const { data, error } = await supabase
        .from('goals')
        .select(GOAL_COLS)
        .eq('project_id', projectId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as DbGoal[] | null) ?? []).map(toGoal);
    },

    async getGoal(id) {
      const { data, error } = await supabase
        .from('goals')
        .select(GOAL_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toGoal(data as DbGoal) : null;
    },

    async insertGoal(input) {
      // La tabla goals exige metric/target_value/periodo (diseño financiero de Etapa 4).
      // Para una meta del árbol de trabajo se usan valores por defecto sensatos: métrica
      // 'manual', objetivo 1, periodo de un año desde hoy. Se refinan en la Etapa 4.
      const { data, error } = await supabase
        .from('goals')
        .insert({
          user_id: userId,
          project_id: input.projectId,
          title: input.title,
          metric: 'manual',
          target_value: input.targetValue ?? 1,
          manual_value: 0,
          period_start: input.startDate ?? ymdInTz(input.tz),
          period_end: input.deadline ?? ymdInTz(input.tz, 1),
          status: 'active',
        })
        .select(GOAL_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toGoal(data as DbGoal);
    },

    async updateGoal(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.description !== undefined) upd.description = patch.description;
      if (patch.targetValue !== undefined) upd.target_value = patch.targetValue;
      if (patch.periodStart !== undefined) upd.period_start = patch.periodStart;
      if (patch.periodEnd !== undefined) upd.period_end = patch.periodEnd;
      const { data, error } = await supabase
        .from('goals')
        .update(upd)
        .eq('id', id)
        .select(GOAL_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toGoal(data as DbGoal);
    },
  };
}
