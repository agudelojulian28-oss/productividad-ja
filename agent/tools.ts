import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { WorkRepo, TaskRow } from '@/core/work/ports';
import { createTask, completeTask, rescheduleTask, deleteTask } from '@/core/work/tasks';
import { consultar, buscar } from '@/core/work/queries';
import {
  CrearTarea,
  Completar,
  Reprogramar,
  Borrar,
  Consultar,
  Buscar,
  type ToolName,
} from './schemas';
import type { ZodType } from 'zod';

/** Efectos externos inyectados por la app (calendario). Mantiene agent puro:
 *  no importa adapters/supabase. */
export interface ToolDeps {
  ctx: ActorContext;
  repo: WorkRepo;
  syncTask?: (task: TaskRow) => Promise<void>;
  removeTaskEvent?: (task: TaskRow) => Promise<void>;
}

function summarize(t: TaskRow) {
  return { id: t.id, titulo: t.title, estado: t.status, fecha: t.dueAt };
}

function parse<T>(schema: ZodType<T>, raw: unknown): Result<T> {
  const p = schema.safeParse(raw);
  return p.success ? ok(p.data) : err('INVALID_INPUT', 'Entrada inválida', p.error.issues);
}

/** Ejecuta una herramienta: valida (Zod), llama al caso de uso de /core, y aplica
 *  los efectos de calendario — el MISMO camino que los botones de la app. */
export async function runTool(
  deps: ToolDeps,
  name: ToolName,
  rawInput: unknown,
): Promise<Result<unknown>> {
  const { ctx, repo } = deps;
  switch (name) {
    case 'crear_tarea': {
      const p = parse(CrearTarea, rawInput);
      if (!p.ok) return p;
      const r = await createTask(ctx, repo, {
        title: p.value.titulo,
        dueAt: p.value.fecha,
        projectId: p.value.proyecto_id,
      });
      if (r.ok) await deps.syncTask?.(r.value);
      return r.ok ? ok(summarize(r.value)) : r;
    }
    case 'completar': {
      const p = parse(Completar, rawInput);
      if (!p.ok) return p;
      const r = await completeTask(ctx, repo, p.value.tarea_id);
      return r.ok ? ok(summarize(r.value)) : r;
    }
    case 'reprogramar': {
      const p = parse(Reprogramar, rawInput);
      if (!p.ok) return p;
      const r = await rescheduleTask(ctx, repo, { id: p.value.tarea_id, dueAt: p.value.fecha });
      if (r.ok) await deps.syncTask?.(r.value);
      return r.ok ? ok(summarize(r.value)) : r;
    }
    case 'borrar': {
      const p = parse(Borrar, rawInput);
      if (!p.ok) return p;
      const task = await repo.getTask(p.value.tarea_id);
      const r = await deleteTask(ctx, repo, p.value.tarea_id);
      if (r.ok && task) await deps.removeTaskEvent?.(task);
      return r.ok ? ok({ borrada: p.value.tarea_id }) : r;
    }
    case 'consultar': {
      const p = parse(Consultar, rawInput);
      if (!p.ok) return p;
      const r = await consultar(ctx, repo, p.value.vista);
      return r.ok ? ok(r.value.map(summarize)) : r;
    }
    case 'buscar': {
      const p = parse(Buscar, rawInput);
      if (!p.ok) return p;
      const r = await buscar(ctx, repo, p.value.texto);
      return r.ok ? ok(r.value.map(summarize)) : r;
    }
  }
}
