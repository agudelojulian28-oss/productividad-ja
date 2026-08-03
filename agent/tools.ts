import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { WorkRepo, TaskRow } from '@/core/work/ports';
import { createTask, completeTask, rescheduleTask, deleteTask } from '@/core/work/tasks';
import { consultar, buscar } from '@/core/work/queries';
import type { FinanceRepo } from '@/core/finance/ports';
import { registrarMovimiento } from '@/core/finance/transactions';
import { resumenFinanciero, porFuente, topGastos } from '@/core/finance/queries';
import { detectarChoques, huecosLibres } from '@/lib/agenda';
import type { StructureRepo } from '@/core/structure/ports';
import { createDocument, appendToDocument, updateDocument, deleteDocument } from '@/core/structure/documents';
import { saveAttachment } from '@/core/structure/attachments';
import { planUndo, type AuditEntry } from '@/lib/undo';
import {
  CrearTarea,
  Completar,
  Reprogramar,
  Borrar,
  Consultar,
  Buscar,
  VerCalendario,
  GestionarEvento,
  GuardarImagen,
  RegistrarMovimiento,
  Documentar,
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

      // ── Agenda (choques y huecos, sobre los eventos de Google) ───────────
      if (vista === 'conflictos' || vista === 'huecos') {
        if (!deps.listRange || (deps.googleConnected && !(await deps.googleConnected()))) {
          return err(
            'EXTERNAL_ERROR',
            'Tu Google Calendar no está conectado. Conéctalo en Ajustes para poder revisar la agenda.',
          );
        }
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz }).format(new Date());
        const fin = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const eventos = await deps.listRange(hoy, fin);
        if (vista === 'conflictos') {
          const ch = detectarChoques(eventos);
          return ok(
            ch.map((c) => ({ evento_a: c.a, evento_b: c.b, desde: c.startIso, hasta: c.endIso })),
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
    case 'documentar': {
      const p = parse(Documentar, rawInput);
      if (!p.ok) return p;
      if (!deps.structure) return err('EXTERNAL_ERROR', 'La documentación no está disponible');
      const v = p.value;
      if (v.modo === 'anexar') {
        const r = await appendToDocument(ctx, deps.structure, {
          id: v.doc_id!,
          content: v.contenido,
        });
        return r.ok ? ok({ anexado: r.value.id, titulo: r.value.title }) : r;
      }
      const r = await createDocument(
        ctx,
        deps.structure,
        {
          title: v.titulo!,
          content: v.contenido,
          kind: v.tipo ?? 'nota',
          areaId: v.area_id,
          projectId: v.proyecto_id,
        },
        'agente',
      );
      return r.ok ? ok({ documento_id: r.value.id, titulo: r.value.title }) : r;
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

      // documents
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
    case 'ver_calendario': {
      const p = parse(VerCalendario, rawInput);
      if (!p.ok) return p;
      if (!deps.listCalendar || (deps.googleConnected && !(await deps.googleConnected()))) {
        return err(
          'EXTERNAL_ERROR',
          'Tu Google Calendar no está conectado. Conéctalo en Ajustes para ver tus eventos.',
        );
      }
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
    case 'gestionar_evento': {
      const p = parse(GestionarEvento, rawInput);
      if (!p.ok) return p;
      const v = p.value;
      const colorId = v.color ? nameToColorId[v.color] : undefined;
      const noEncontrado = err(
        'NOT_FOUND',
        'No encontré ese evento con ese ID. Llama a ver_calendario para obtener el ID actual y reintenta.',
      );

      if (v.accion === 'crear') {
        if (!deps.createEvent) return err('EXTERNAL_ERROR', 'Google Calendar no está conectado');
        const id = await deps.createEvent({
          titulo: v.titulo!,
          fecha: v.fecha!,
          colorId,
          durationMin: v.duracion_min,
          descripcion: v.descripcion,
          projectId: v.proyecto_id,
          goalId: v.meta_id,
        });
        return ok({ evento_id: id });
      }
      if (v.accion === 'editar') {
        if (!deps.editEvent) return err('EXTERNAL_ERROR', 'Google Calendar no está conectado');
        try {
          await deps.editEvent(v.evento_id!, {
            titulo: v.titulo,
            fecha: v.fecha,
            colorId,
            recurrencia: v.recurrencia,
            scope: v.alcance,
          });
          return ok({ editado: v.evento_id });
        } catch {
          return noEncontrado;
        }
      }
      // borrar
      if (!deps.deleteEvent) return err('EXTERNAL_ERROR', 'Google Calendar no está conectado');
      try {
        await deps.deleteEvent(v.evento_id!, { scope: v.alcance ?? 'serie' });
        return ok({ borrado: v.evento_id });
      } catch {
        return noEncontrado;
      }
    }
  }
}
