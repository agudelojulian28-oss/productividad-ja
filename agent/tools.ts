import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { WorkRepo, TaskRow } from '@/core/work/ports';
import {
  createTask,
  completeTask,
  reopenTask,
  rescheduleTask,
  setTaskDescription,
  deleteTask,
} from '@/core/work/tasks';
import { createProject, setProjectDescription } from '@/core/work/projects';
import { createGoal, updateGoal, setGoalDescription } from '@/core/work/goals';
import { consultar, buscar } from '@/core/work/queries';
import type { FinanceRepo } from '@/core/finance/ports';
import { registrarMovimiento } from '@/core/finance/transactions';
import { createIncomeSource, archiveIncomeSource } from '@/core/finance/income-sources';
import { createMoneyGoal } from '@/core/finance/goals';
import { resumenFinanciero, porFuente, topGastos } from '@/core/finance/queries';
import { detectarChoques, huecosLibres } from '@/lib/agenda';
import type { StructureRepo } from '@/core/structure/ports';
import { createArea, archiveArea, setAreaDescription } from '@/core/structure/areas';
import { createDocument, appendToDocument, updateDocument, deleteDocument } from '@/core/structure/documents';
import { saveAttachment } from '@/core/structure/attachments';
import { planUndo, type AuditEntry } from '@/lib/undo';
import { Consultar, Buscar, Crear, Actualizar, Archivar, GuardarImagen, type ToolName } from './schemas';
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
  structure?: StructureRepo;
  listCalendar?: (dateYmd: string) => Promise<GEvent[]>;
  listRange?: (startYmd: string, endYmd: string) => Promise<GEvent[]>;
  /** ¿Google Calendar está conectado? Distingue "sin conexión" de "agenda vacía". */
  googleConnected?: () => Promise<boolean>;
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
  /** Última mutación del usuario (de audit_log), para `deshacer`. */
  lastAudit?: () => Promise<AuditEntry | null>;
}

function summarize(t: TaskRow) {
  return { id: t.id, titulo: t.title, estado: t.status, fecha: t.dueAt };
}

function parse<T>(schema: ZodType<T>, raw: unknown): Result<T> {
  const p = schema.safeParse(raw);
  return p.success ? ok(p.data) : err('INVALID_INPUT', 'Entrada inválida', p.error.issues);
}

const CAL_OFF = 'Tu Google Calendar no está conectado. Conéctalo en Ajustes.';
const noEvento = err(
  'NOT_FOUND',
  'No encontré ese evento. Llama a consultar (vista agenda) para obtener el ID actual y reintenta.',
);

async function calendarReady(deps: ToolDeps): Promise<boolean> {
  if (deps.googleConnected) return deps.googleConnected();
  return true;
}

/** Ejecuta una herramienta: valida (Zod), llama al caso de uso de /core, y aplica
 *  los efectos de calendario — el MISMO camino que los botones de la app.
 *  Verbos generales (ADR-024): crear/actualizar/archivar despachan por `tipo`. */
export async function runTool(
  deps: ToolDeps,
  name: ToolName,
  rawInput: unknown,
): Promise<Result<unknown>> {
  const { ctx, repo } = deps;
  switch (name) {
    // ── consultar (lecturas) ─────────────────────────────────────────────
    case 'consultar': {
      const p = parse(Consultar, rawInput);
      if (!p.ok) return p;
      const vista = p.value.vista;

      if (vista === 'agenda_hoy' || vista === 'pendientes') {
        const r = await consultar(ctx, repo, vista);
        return r.ok ? ok(r.value.map(summarize)) : r;
      }
      if (vista === 'agenda') {
        if (!deps.listCalendar || !(await calendarReady(deps))) return err('EXTERNAL_ERROR', CAL_OFF);
        const dia = p.value.fecha ?? new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz }).format(new Date());
        const events = await deps.listCalendar(dia);
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
      if (vista === 'estructura') {
        const [areas, projects] = await Promise.all([
          deps.structure ? deps.structure.listAreas() : Promise.resolve([]),
          repo.listProjects(),
        ]);
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
        return ok({
          areas: areas.map((a) => ({ area_id: a.id, nombre: a.name, clase: a.kind })),
          proyectos: arbol,
        });
      }
      if (vista === 'documentacion') {
        if (!deps.structure) return err('EXTERNAL_ERROR', 'La documentación no está disponible');
        const docs = await deps.structure.listDocuments(
          p.value.proyecto_id ? { projectId: p.value.proyecto_id } : undefined,
        );
        return ok(
          docs.map((d) => ({
            doc_id: d.id,
            titulo: d.title,
            tipo: d.kind,
            autor: d.author,
            fijado: d.pinned,
            proyecto_id: d.projectId,
            contenido: d.content,
          })),
        );
      }
      if (vista === 'conflictos' || vista === 'huecos') {
        if (!deps.listRange || !(await calendarReady(deps))) return err('EXTERNAL_ERROR', CAL_OFF);
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz }).format(new Date());
        const fin = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const eventos = await deps.listRange(hoy, fin);
        if (vista === 'conflictos') {
          return ok(
            detectarChoques(eventos).map((c) => ({
              evento_a: c.a,
              evento_b: c.b,
              desde: c.startIso,
              hasta: c.endIso,
            })),
          );
        }
        const huecos = huecosLibres(eventos, {
          fromIso: new Date().toISOString(),
          toIso: `${fin}T23:59:59Z`,
          duracionMin: p.value.duracion_min ?? 60,
          tz: ctx.tz,
        });
        return ok(huecos.slice(0, 10).map((h) => ({ desde: h.startIso, hasta: h.endIso })));
      }

      // Dinero
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

    // ── crear (unión por tipo) ───────────────────────────────────────────
    case 'crear': {
      const p = parse(Crear, rawInput);
      if (!p.ok) return p;
      const v = p.value;
      switch (v.tipo) {
        case 'tarea': {
          const r = await createTask(ctx, repo, {
            title: v.titulo!,
            dueAt: v.fecha,
            projectId: v.proyecto_id,
            goalId: v.meta_id,
          });
          return r.ok ? ok(summarize(r.value)) : r;
        }
        case 'evento': {
          if (!deps.createEvent || !(await calendarReady(deps))) return err('EXTERNAL_ERROR', CAL_OFF);
          const id = await deps.createEvent({
            titulo: v.titulo!,
            fecha: v.fecha!,
            colorId: v.color ? nameToColorId[v.color] : undefined,
            durationMin: v.duracion_min,
            descripcion: v.descripcion,
            projectId: v.proyecto_id,
            goalId: v.meta_id,
          });
          return ok({ evento_id: id });
        }
        case 'proyecto': {
          const r = await createProject(ctx, repo, { title: v.titulo!, areaId: v.area_id! });
          return r.ok ? ok({ proyecto_id: r.value.id, titulo: r.value.title }) : r;
        }
        case 'meta': {
          const r = await createGoal(ctx, repo, {
            projectId: v.proyecto_id!,
            title: v.titulo!,
            targetValue: v.objetivo,
            startDate: v.desde,
            deadline: v.hasta,
          });
          return r.ok ? ok({ meta_id: r.value.id, titulo: r.value.title }) : r;
        }
        case 'area': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'No disponible');
          const r = await createArea(ctx, deps.structure, { name: v.titulo!, kind: v.clase! });
          return r.ok ? ok({ area_id: r.value.id, nombre: r.value.name }) : r;
        }
        case 'fuente': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await createIncomeSource(ctx, deps.finance, {
            areaId: v.area_id!,
            name: v.titulo!,
            model: v.modelo!,
          });
          return r.ok ? ok({ fuente_id: r.value.id, nombre: r.value.name }) : r;
        }
        case 'meta_dinero': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await createMoneyGoal(ctx, deps.finance, {
            title: v.titulo!,
            metric: v.metrica!,
            targetValue: v.objetivo!,
            areaId: v.area_id,
            incomeSourceId: v.fuente_id,
            periodStart: v.desde!,
            periodEnd: v.hasta!,
          });
          return r.ok ? ok({ meta_dinero_id: r.value.id }) : r;
        }
        case 'documento': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'La documentación no está disponible');
          const r = await createDocument(
            ctx,
            deps.structure,
            {
              title: v.titulo!,
              content: v.contenido,
              kind: v.clase_doc ?? 'nota',
              areaId: v.area_id,
              projectId: v.proyecto_id,
            },
            'agente',
          );
          return r.ok ? ok({ documento_id: r.value.id, titulo: r.value.title }) : r;
        }
        case 'movimiento': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await registrarMovimiento(ctx, deps.finance, {
            direction: v.direccion === 'ingreso' ? 'in' : 'out',
            amountMinor: Math.round(v.monto! * 100),
            currency: v.moneda ?? 'COP',
            areaId: v.area_id!,
            incomeSourceId: v.fuente_id,
            category: v.categoria,
            occurredOn: v.desde, // opcional; el core usa hoy si falta
            fxRate: v.tasa,
          });
          return r.ok
            ? ok({ registrado: r.value.id, monto: money(r.value.baseAmountMinor), moneda: r.value.currency })
            : r;
        }
      }
      return err('INVALID_INPUT', 'Tipo desconocido');
    }

    // ── actualizar (unión por tipo) ──────────────────────────────────────
    case 'actualizar': {
      const p = parse(Actualizar, rawInput);
      if (!p.ok) return p;
      const v = p.value;
      switch (v.tipo) {
        case 'tarea': {
          if (v.accion === 'completar') {
            const r = await completeTask(ctx, repo, v.id);
            return r.ok ? ok(summarize(r.value)) : r;
          }
          if (v.accion === 'reabrir') {
            const r = await reopenTask(ctx, repo, v.id);
            return r.ok ? ok(summarize(r.value)) : r;
          }
          if (v.accion === 'reprogramar') {
            if (!v.fecha) return err('INVALID_INPUT', 'Reprogramar necesita fecha');
            const r = await rescheduleTask(ctx, repo, { id: v.id, dueAt: v.fecha });
            return r.ok ? ok(summarize(r.value)) : r;
          }
          if (v.accion === 'descripcion') {
            const r = await setTaskDescription(ctx, repo, v.id, v.descripcion ?? null);
            return r.ok ? ok(summarize(r.value)) : r;
          }
          // mover
          const task = await repo.getTask(v.id);
          if (!task) return err('NOT_FOUND', 'La tarea no existe');
          const row = await repo.updateTask(v.id, {
            projectId: v.proyecto_id ?? undefined,
            goalId: v.meta_id ?? undefined,
          });
          return ok(summarize(row));
        }
        case 'meta': {
          if (v.accion === 'descripcion') {
            const r = await setGoalDescription(ctx, repo, v.id, v.descripcion ?? null);
            return r.ok ? ok({ meta_id: r.value.id }) : r;
          }
          const r = await updateGoal(ctx, repo, v.id, {
            targetValue: v.objetivo,
            startDate: v.desde,
            deadline: v.hasta,
          });
          return r.ok ? ok({ meta_id: r.value.id, objetivo: r.value.targetValue }) : r;
        }
        case 'proyecto': {
          const r = await setProjectDescription(ctx, repo, v.id, v.descripcion ?? null);
          return r.ok ? ok({ proyecto_id: r.value.id }) : r;
        }
        case 'area': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'No disponible');
          const r = await setAreaDescription(ctx, deps.structure, v.id, v.descripcion ?? null);
          return r.ok ? ok({ area_id: r.value.id }) : r;
        }
        case 'documento': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'La documentación no está disponible');
          if (v.accion === 'anexar') {
            if (!v.descripcion) return err('INVALID_INPUT', 'Anexar necesita el texto en descripcion');
            const r = await appendToDocument(ctx, deps.structure, { id: v.id, content: v.descripcion });
            return r.ok ? ok({ doc_id: r.value.id }) : r;
          }
          if (v.accion === 'fijar') {
            const r = await updateDocument(ctx, deps.structure, v.id, { pinned: v.fijado ?? true });
            return r.ok ? ok({ doc_id: r.value.id, fijado: r.value.pinned }) : r;
          }
          // editar
          const r = await updateDocument(ctx, deps.structure, v.id, {
            title: v.titulo,
            content: v.descripcion,
            pinned: v.fijado,
          });
          return r.ok ? ok({ doc_id: r.value.id }) : r;
        }
        case 'evento': {
          if (!deps.editEvent || !(await calendarReady(deps))) return err('EXTERNAL_ERROR', CAL_OFF);
          try {
            await deps.editEvent(v.id, {
              titulo: v.titulo,
              fecha: v.fecha,
              colorId: v.color ? nameToColorId[v.color] : undefined,
              recurrencia: v.recurrencia,
              scope: v.alcance,
            });
            return ok({ editado: v.id });
          } catch {
            return noEvento;
          }
        }
      }
      return err('INVALID_INPUT', 'Tipo desconocido');
    }

    // ── archivar / borrar (unión por tipo) ───────────────────────────────
    case 'archivar': {
      const p = parse(Archivar, rawInput);
      if (!p.ok) return p;
      const v = p.value;
      switch (v.tipo) {
        case 'tarea': {
          const r = await deleteTask(ctx, repo, v.id);
          return r.ok ? ok({ borrada: v.id }) : r;
        }
        case 'documento': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'La documentación no está disponible');
          const r = await deleteDocument(ctx, deps.structure, v.id);
          return r.ok ? ok({ borrado: v.id }) : r;
        }
        case 'area': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'No disponible');
          const r = await archiveArea(ctx, deps.structure, v.id);
          return r.ok ? ok({ archivada: v.id }) : r;
        }
        case 'fuente': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await archiveIncomeSource(ctx, deps.finance, v.id);
          return r.ok ? ok({ archivada: v.id }) : r;
        }
        case 'evento': {
          if (!deps.deleteEvent || !(await calendarReady(deps))) return err('EXTERNAL_ERROR', CAL_OFF);
          try {
            await deps.deleteEvent(v.id, { scope: v.alcance ?? 'serie' });
            return ok({ borrado: v.id });
          } catch {
            return noEvento;
          }
        }
      }
      return err('INVALID_INPUT', 'Tipo desconocido');
    }

    case 'guardar_imagen': {
      const p = parse(GuardarImagen, rawInput);
      if (!p.ok) return p;
      if (!deps.structure) return err('EXTERNAL_ERROR', 'No disponible');
      const r = await saveAttachment(ctx, deps.structure, {
        id: p.value.adjunto_id,
        projectId: p.value.proyecto_id,
        description: p.value.descripcion,
      });
      return r.ok ? ok({ guardada: r.value.id, proyecto_id: r.value.projectId }) : r;
    }

    case 'deshacer': {
      if (!deps.lastAudit) return err('EXTERNAL_ERROR', 'Deshacer no está disponible');
      const plan = planUndo(await deps.lastAudit(), Date.now());
      if (!plan.ok) return ok({ deshecho: false, motivo: plan.motivo });

      if (plan.entityType === 'tasks') {
        if (plan.kind === 'delete') {
          const r = await deleteTask(ctx, repo, plan.entityId);
          return r.ok ? ok({ deshecho: true, detalle: 'Se borró la tarea creada.' }) : r;
        }
        const b = plan.before!;
        await repo.updateTask(plan.entityId, {
          title: b.title as string,
          notes: (b.notes as string | null) ?? null,
          status: b.status as TaskRow['status'],
          dueAt: (b.due_at as string | null) ?? null,
          completedAt: (b.completed_at as string | null) ?? null,
          goalId: (b.goal_id as string | null) ?? null,
        });
        return ok({ deshecho: true, detalle: 'Se restauró la tarea a su estado anterior.' });
      }

      if (!deps.structure) return err('EXTERNAL_ERROR', 'La documentación no está disponible');
      if (plan.kind === 'delete') {
        const r = await deleteDocument(ctx, deps.structure, plan.entityId);
        return r.ok ? ok({ deshecho: true, detalle: 'Se borró el documento creado.' }) : r;
      }
      const b = plan.before!;
      const r = await updateDocument(ctx, deps.structure, plan.entityId, {
        title: b.title as string,
        content: b.content as string,
        pinned: b.pinned as boolean,
      });
      return r.ok ? ok({ deshecho: true, detalle: 'Se restauró el documento a su estado anterior.' }) : r;
    }
  }
}
