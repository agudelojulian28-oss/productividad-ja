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
  VerCalendario,
  EditarEvento,
  BorrarEvento,
  Estructura,
  type ToolName,
} from './schemas';
import type { ZodType } from 'zod';
import type { GEvent } from '@/adapters/google/calendar';
import { nameToColorId } from '@/lib/calendar-colors';
import type { Recurrencia } from '@/lib/recurrence';

type EventScope = 'serie' | 'instancia';

/** Efectos externos inyectados por la app (calendario). Mantiene agent puro:
 *  no importa adapters/supabase. */
export interface ToolDeps {
  ctx: ActorContext;
  repo: WorkRepo;
  syncTask?: (task: TaskRow) => Promise<void>;
  removeTaskEvent?: (task: TaskRow) => Promise<void>;
  listCalendar?: (dateYmd: string) => Promise<GEvent[]>;
  editEvent?: (
    eventId: string,
    patch: {
      titulo?: string;
      fecha?: string;
      colorId?: string;
      durationMin?: number;
      recurrencia?: Recurrencia;
      scope?: EventScope;
    },
  ) => Promise<void>;
  deleteEvent?: (eventId: string, opts?: { scope?: EventScope }) => Promise<void>;
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
        goalId: p.value.meta_id,
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
    case 'estructura': {
      const p = parse(Estructura, rawInput);
      if (!p.ok) return p;
      const projects = await repo.listProjects();
      const arbol = [];
      for (const proj of projects) {
        const metas = await repo.listGoals(proj.id);
        arbol.push({
          proyecto_id: proj.id,
          titulo: proj.title,
          area_id: proj.areaId,
          metas: metas.map((g) => ({ meta_id: g.id, titulo: g.title })),
        });
      }
      return ok(arbol);
    }
    case 'ver_calendario': {
      const p = parse(VerCalendario, rawInput);
      if (!p.ok) return p;
      if (!deps.listCalendar) return err('EXTERNAL_ERROR', 'Google Calendar no está conectado');
      const dateYmd =
        p.value.fecha ?? new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz }).format(new Date());
      const events = await deps.listCalendar(dateYmd);
      return ok(
        events.map((e) => ({
          id: e.id,
          titulo: e.summary,
          inicio: e.start,
          todo_el_dia: e.allDay,
          es_recurrente: Boolean(e.recurringEventId || e.recurrence),
          serie_id: e.recurringEventId,
        })),
      );
    }
    case 'editar_evento': {
      const p = parse(EditarEvento, rawInput);
      if (!p.ok) return p;
      if (!deps.editEvent) return err('EXTERNAL_ERROR', 'Google Calendar no está conectado');
      const colorId = p.value.color ? nameToColorId[p.value.color] : undefined;
      try {
        await deps.editEvent(p.value.evento_id, {
          titulo: p.value.titulo,
          fecha: p.value.fecha,
          colorId,
          recurrencia: p.value.recurrencia,
          scope: p.value.alcance,
        });
        return ok({ editado: p.value.evento_id });
      } catch {
        return err(
          'NOT_FOUND',
          'No encontré ese evento con ese ID. Llama a ver_calendario para obtener el ID actual y reintenta.',
        );
      }
    }
    case 'borrar_evento': {
      const p = parse(BorrarEvento, rawInput);
      if (!p.ok) return p;
      if (!deps.deleteEvent) return err('EXTERNAL_ERROR', 'Google Calendar no está conectado');
      try {
        await deps.deleteEvent(p.value.evento_id, { scope: p.value.alcance ?? 'serie' });
        return ok({ borrado: p.value.evento_id });
      } catch {
        return err(
          'NOT_FOUND',
          'No encontré ese evento con ese ID. Llama a ver_calendario para obtener el ID actual y reintenta.',
        );
      }
    }
  }
}
