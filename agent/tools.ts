import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { WorkRepo, TaskRow } from '@/core/work/ports';
import { createTask, completeTask, rescheduleTask, deleteTask } from '@/core/work/tasks';
import { consultar, buscar } from '@/core/work/queries';
import type { FinanceRepo } from '@/core/finance/ports';
import { registrarMovimiento } from '@/core/finance/transactions';
import { resumenFinanciero, porFuente, topGastos } from '@/core/finance/queries';
import {
  CrearTarea,
  Completar,
  Reprogramar,
  Borrar,
  Consultar,
  Buscar,
  VerCalendario,
  CrearEvento,
  EditarEvento,
  BorrarEvento,
  RegistrarMovimiento,
  type ToolName,
} from './schemas';
import type { ZodType } from 'zod';
import type { GEvent } from '@/adapters/google/calendar';
import { nameToColorId } from '@/lib/calendar-colors';
import { money } from '@/lib/format';
import type { Recurrencia } from '@/lib/recurrence';

type EventScope = 'serie' | 'instancia';

/** Efectos externos inyectados por la app (calendario). Mantiene agent puro:
 *  no importa adapters/supabase. */
export interface ToolDeps {
  ctx: ActorContext;
  repo: WorkRepo;
  finance?: FinanceRepo;
  listCalendar?: (dateYmd: string) => Promise<GEvent[]>;
  createEvent?: (input: {
    titulo: string;
    fecha: string;
    colorId?: string;
    durationMin?: number;
    descripcion?: string;
    projectId?: string;
    goalId?: string;
  }) => Promise<string>;
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
      return r.ok ? ok(summarize(r.value)) : r;
    }
    case 'borrar': {
      const p = parse(Borrar, rawInput);
      if (!p.ok) return p;
      const r = await deleteTask(ctx, repo, p.value.tarea_id);
      return r.ok ? ok({ borrada: p.value.tarea_id }) : r;
    }
    case 'consultar': {
      const p = parse(Consultar, rawInput);
      if (!p.ok) return p;
      const vista = p.value.vista;

      // ── Trabajo ────────────────────────────────────────────────────────
      if (vista === 'agenda_hoy' || vista === 'pendientes') {
        const r = await consultar(ctx, repo, vista);
        return r.ok ? ok(r.value.map(summarize)) : r;
      }
      if (vista === 'estructura') {
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

      // ── Dinero (mismas vistas que pinta el panel: una cifra, una fuente) ──
      if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
      const fin = deps.finance;
      if (vista === 'resumen_financiero') {
        const r = resumenFinanciero(await fin.cashflowMonthly(), ctx.tz);
        return ok({
          mes: r.monthKey,
          ingresos: money(r.inflowMinor),
          gastos: money(r.outflowMinor),
          neto: money(r.netMinor),
          movimientos: r.movements,
          desactualizado: r.stale,
          ultimo_registro_hace_dias: r.staleDays,
        });
      }
      if (vista === 'por_fuente') {
        return ok(
          porFuente(await fin.bySource()).map((f) => ({
            fuente: f.name,
            area: f.area,
            este_mes: money(f.thisMonthMinor),
            ultimos_12_meses: money(f.ttmMinor),
          })),
        );
      }
      if (vista === 'gastos') {
        return ok(
          topGastos(await fin.expensesByCategory(), ctx.tz).map((g) => ({
            categoria: g.category,
            monto: money(g.amountMinor),
          })),
        );
      }
      if (vista === 'por_cobrar') {
        const rows = await fin.receivables();
        if (rows.length === 0)
          return ok({ items: [], nota: 'Sin cuentas por cobrar (las ventas llegan en la Etapa 5).' });
        return ok(
          rows.map((r) => ({
            cliente: r.client,
            oferta: r.offering,
            pendiente: money(r.outstandingMinor),
            dias: r.daysOutstanding,
          })),
        );
      }
      // pipeline
      const rows = await fin.pipeline();
      if (rows.length === 0)
        return ok({ items: [], nota: 'Pipeline vacío (las ventas llegan en la Etapa 5).' });
      return ok(rows.map((r) => ({ etapa: r.stage, tratos: r.deals, valor: money(r.valueMinor) })));
    }
    case 'buscar': {
      const p = parse(Buscar, rawInput);
      if (!p.ok) return p;
      const r = await buscar(ctx, repo, p.value.texto);
      return r.ok ? ok(r.value.map(summarize)) : r;
    }
    case 'registrar_movimiento': {
      const p = parse(RegistrarMovimiento, rawInput);
      if (!p.ok) return p;
      if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
      const v = p.value;
      const r = await registrarMovimiento(ctx, deps.finance, {
        direction: v.tipo === 'ingreso' ? 'in' : 'out',
        amountMinor: Math.round(v.monto * 100),
        currency: v.moneda,
        areaId: v.area_id,
        incomeSourceId: v.fuente_id,
        category: v.categoria,
        occurredOn: v.fecha,
        fxRate: v.tasa,
      });
      if (!r.ok) return r;
      return ok({
        registrado: r.value.id,
        tipo: v.tipo,
        monto: money(r.value.baseAmountMinor),
        moneda: r.value.currency,
      });
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
    case 'crear_evento': {
      const p = parse(CrearEvento, rawInput);
      if (!p.ok) return p;
      if (!deps.createEvent) return err('EXTERNAL_ERROR', 'Google Calendar no está conectado');
      const colorId = p.value.color ? nameToColorId[p.value.color] : undefined;
      const id = await deps.createEvent({
        titulo: p.value.titulo,
        fecha: p.value.fecha,
        colorId,
        durationMin: p.value.duracion_min,
        descripcion: p.value.descripcion,
        projectId: p.value.proyecto_id,
        goalId: p.value.meta_id,
      });
      return ok({ evento_id: id });
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
