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
import {
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
} from '@/core/work/recurring-tasks';
import { consultar, buscar } from '@/core/work/queries';
import type { FinanceRepo } from '@/core/finance/ports';
import { registrarMovimiento, updateTransaction, deleteTransaction } from '@/core/finance/transactions';
import {
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  confirmRecurringExpense,
  skipRecurringExpense,
} from '@/core/finance/recurring';
import { createMoneyGoal } from '@/core/finance/goals';
import {
  createTag,
  updateTag,
  deleteTag,
  setTransactionTags,
  setRecurringTags,
} from '@/core/finance/tags';
import { resumenFinanciero, resumenPorPeriodo, enPeriodo, topGastos } from '@/core/finance/queries';
import { sustainingSummary, monthlyEquivalent, toCopMinor } from '@/core/finance/sustaining';
import { getTrm } from '@/lib/trm';
import { detectarChoques, huecosLibres } from '@/lib/agenda';
import type { StructureRepo } from '@/core/structure/ports';
import { createArea, archiveArea, setAreaDescription } from '@/core/structure/areas';
import { createDocument, appendToDocument, updateDocument, deleteDocument } from '@/core/structure/documents';
import { saveAttachment } from '@/core/structure/attachments';
import { planUndo, type AuditEntry } from '@/lib/undo';
import {
  Consultar,
  Buscar,
  Crear,
  Actualizar,
  Archivar,
  GuardarImagen,
  MoverAgenda,
  type ToolName,
} from './schemas';
import type { ZodType } from 'zod';
import type { GEvent } from '@/adapters/google/calendar';
import { nameToColorId } from '@/lib/calendar-colors';
import { money, todayInTz } from '@/lib/format';
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
      if (vista === 'tareas_recurrentes') {
        const [recs, projects] = await Promise.all([repo.listRecurringTasks(), repo.listProjects()]);
        const nombre = new Map(projects.map((pr) => [pr.id, pr.title] as const));
        return ok(
          recs.map((r) => ({
            id: r.id,
            titulo: r.title,
            frecuencia: r.frequency,
            proxima: r.nextDueOn,
            proyecto: r.projectId ? (nombre.get(r.projectId) ?? '—') : '—',
          })),
        );
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
          const [metas, tareas] = await Promise.all([
            repo.listGoals(proj.id),
            repo.listTasks({ projectId: proj.id }),
          ]);
          arbol.push({
            proyecto_id: proj.id,
            titulo: proj.title,
            area_id: proj.areaId,
            metas: metas.map((g) => ({ meta_id: g.id, titulo: g.title })),
            // Ejemplos de tareas recientes → para inferir "esto suele ir aquí".
            tareas_ejemplo: tareas.slice(0, 6).map((t) => t.title),
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
        const cf = await fin.cashflowMonthly();
        const periodo = p.value.periodo ?? 'mes';
        const per = resumenPorPeriodo(cf, ctx.tz, periodo);
        const base = resumenFinanciero(cf, ctx.tz); // para el aviso de desactualización (global)
        return ok({
          periodo: per.etiqueta,
          ingresos: money(per.inflowMinor),
          gastos: money(per.outflowMinor),
          neto: money(per.netMinor),
          movimientos: per.movements,
          desactualizado: base.stale,
          ultimo_registro_hace_dias: base.staleDays,
        });
      }
      if (vista === 'por_proyecto') {
        const periodo = p.value.periodo ?? 'todo';
        const rows = await fin.byProject();
        const projects = await repo.listProjects();
        const nombre = new Map(projects.map((p) => [p.id, p.title] as const));
        const agg = new Map<string, { inflow: number; outflow: number }>();
        for (const r of rows) {
          if (!enPeriodo(r.month, periodo, ctx.tz)) continue;
          const cur = agg.get(r.projectId) ?? { inflow: 0, outflow: 0 };
          cur.inflow += r.inflowMinor;
          cur.outflow += r.outflowMinor;
          agg.set(r.projectId, cur);
        }
        return ok(
          [...agg].map(([pid, v]) => ({
            proyecto: nombre.get(pid) ?? '—',
            ingresos: money(v.inflow),
            gastos: money(v.outflow),
            neto: money(v.inflow - v.outflow),
          })),
        );
      }
      if (vista === 'movimientos') {
        const { desde, hasta, direccion } = p.value;
        const dir = direccion === 'ingreso' ? 'in' : direccion === 'gasto' ? 'out' : undefined;
        const [txs, projects] = await Promise.all([
          fin.listTransactions({ from: desde, to: hasta, direction: dir, limit: 100 }),
          repo.listProjects(),
        ]);
        const nombre = new Map(projects.map((pr) => [pr.id, pr.title] as const));
        return ok(
          txs.map((t) => ({
            fecha: t.occurredOn,
            tipo: t.direction === 'in' ? 'ingreso' : 'gasto',
            monto: money(t.baseAmountMinor),
            proyecto: t.projectId ? (nombre.get(t.projectId) ?? '—') : '—',
            concepto: t.description || t.category || undefined,
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
      if (vista === 'recurrentes') {
        const list = await fin.listRecurringExpenses();
        const hoy = todayInTz(ctx.tz);
        const projects = await repo.listProjects();
        const nombre = new Map(projects.map((p) => [p.id, p.title] as const));
        return ok(
          list.map((r) => ({
            id: r.id,
            tipo: r.direction === 'in' ? 'ingreso recurrente' : 'gasto recurrente',
            concepto: r.description || r.category || (r.direction === 'in' ? 'ingreso recurrente' : 'gasto recurrente'),
            monto: money(r.amountMinor),
            frecuencia: r.frequency,
            proximo: r.nextDueOn,
            proyecto: nombre.get(r.projectId) ?? '—',
            vencido: r.nextDueOn <= hoy,
          })),
        );
      }
      if (vista === 'sostenimiento') {
        const [services, trm] = await Promise.all([fin.listSustaining(), getTrm()]);
        const resumen = sustainingSummary(services, todayInTz(ctx.tz), trm.value);
        const usdFmt = (minor: number) => 'US$' + (minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
        const enMoneda = (minor: number, cur: 'COP' | 'USD') => (cur === 'USD' ? usdFmt(minor) : money(minor));
        return ok({
          trm: { valor: trm.value, fecha: trm.date || undefined, aproximada: trm.fallback },
          total_mensual: money(resumen.monthlyTotalMinor),
          posible_futuro: money(resumen.futurosMinor),
          servicios: services.map((s) => ({
            id: s.id,
            nombre: s.name,
            estado: s.status,
            cadencia: s.cadence,
            moneda: s.currency,
            monto: enMoneda(s.amountMinor, s.currency),
            monto_mensual_cop:
              s.currency === 'USD'
                ? money(toCopMinor(monthlyEquivalent(s.amountMinor, s.cadence), 'USD', trm.value))
                : undefined,
            saldo: s.balanceMinor == null ? undefined : enMoneda(s.balanceMinor, s.currency),
            renueva: s.renewsOn ?? undefined,
          })),
          alertas: resumen.alerts.map((a) =>
            a.kind === 'recargar'
              ? { tipo: 'recargar', servicio: a.name, saldo: enMoneda(a.balanceMinor ?? 0, a.currency) }
              : { tipo: 'renovacion', servicio: a.name, fecha: a.renewsOn },
          ),
        });
      }
      if (vista === 'reservas') {
        await fin.ensureReserves();
        const summary = await fin.reserveSummary();
        const one = (k: 'flujo' | 'emergencia') => {
          const r = summary.find((s) => s.kind === k);
          if (!r) return { saldo: money(0), meta: money(0), bajo_meta: false };
          return {
            saldo: money(r.balanceMinor),
            meta: r.targetMinor > 0 ? money(r.targetMinor) : 'sin meta',
            falta: money(Math.max(0, r.targetMinor - r.balanceMinor)),
            bajo_meta: r.targetMinor > 0 && r.balanceMinor < r.targetMinor,
            descripcion: r.description ?? undefined,
          };
        };
        return ok({
          flujo_de_caja: one('flujo'),
          fondo_de_emergencia: one('emergencia'),
        });
      }
      if (vista === 'etiquetas') {
        const tags = await fin.listTags(p.value.proyecto_id);
        const projects = await repo.listProjects();
        const nombre = new Map(projects.map((pr) => [pr.id, pr.title] as const));
        return ok(
          tags.map((t) => ({
            id: t.id,
            nombre: t.name,
            color: t.color,
            proyecto_id: t.projectId,
            proyecto: nombre.get(t.projectId) ?? '—',
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
        case 'tarea_recurrente': {
          const r = await createRecurringTask(ctx, repo, {
            title: v.titulo!,
            notes: v.descripcion ?? null,
            projectId: v.proyecto_id ?? null,
            goalId: v.meta_id ?? null,
            frequency: v.frecuencia!,
            nextDueOn: v.desde!,
          });
          return r.ok
            ? ok({ tarea_recurrente_id: r.value.id, titulo: r.value.title, frecuencia: r.value.frequency, proxima: r.value.nextDueOn })
            : r;
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
        case 'meta_dinero': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          if (!v.proyecto_id) {
            return err('NOT_FOUND', 'Indica un proyecto (proyecto_id) para la meta de dinero');
          }
          const r = await createMoneyGoal(ctx, deps.finance, {
            title: v.titulo!,
            metric: v.metrica!,
            targetValue: v.objetivo!,
            projectId: v.proyecto_id,
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
          // El dinero se atribuye a un proyecto (ADR-026); el área sale del proyecto.
          const proj = v.proyecto_id ? await repo.getProject(v.proyecto_id) : null;
          if (!proj) {
            return err('NOT_FOUND', 'Indica un proyecto válido (proyecto_id) para el movimiento');
          }
          const r = await registrarMovimiento(ctx, deps.finance, {
            direction: v.direccion === 'ingreso' ? 'in' : 'out',
            amountMinor: Math.round(v.monto! * 100),
            currency: v.moneda ?? 'COP',
            areaId: proj.areaId,
            projectId: proj.id,
            category: v.categoria,
            description: v.descripcion,
            occurredOn: v.desde, // opcional; el core usa hoy si falta
            fxRate: v.tasa,
          });
          if (!r.ok) return r;
          if (v.etiquetas && v.etiquetas.length > 0) {
            await setTransactionTags(ctx, deps.finance, { id: r.value.id, tagIds: v.etiquetas });
          }
          return ok({ registrado: r.value.id, monto: money(r.value.baseAmountMinor), moneda: r.value.currency });
        }
        case 'recurrente': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const proj = v.proyecto_id ? await repo.getProject(v.proyecto_id) : null;
          if (!proj) {
            return err('NOT_FOUND', 'Indica un proyecto válido (proyecto_id) para el recurrente');
          }
          const r = await createRecurringExpense(ctx, deps.finance, {
            direction: v.direccion === 'ingreso' ? 'in' : 'out',
            projectId: proj.id,
            areaId: proj.areaId,
            amountMinor: Math.round(v.monto! * 100),
            category: v.categoria,
            description: v.descripcion,
            frequency: v.frecuencia!,
            nextDueOn: v.desde!,
          });
          if (!r.ok) return r;
          if (v.etiquetas && v.etiquetas.length > 0) {
            await setRecurringTags(ctx, deps.finance, { id: r.value.id, tagIds: v.etiquetas });
          }
          return ok({
            recurrente_id: r.value.id,
            tipo: r.value.direction === 'in' ? 'ingreso recurrente' : 'gasto recurrente',
            monto: money(r.value.amountMinor),
            frecuencia: r.value.frequency,
          });
        }
        case 'etiqueta': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await createTag(ctx, deps.finance, {
            name: v.titulo!,
            color: v.color_hex ?? null,
            projectId: v.proyecto_id!,
          });
          return r.ok ? ok({ etiqueta_id: r.value.id, nombre: r.value.name, proyecto_id: r.value.projectId }) : r;
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
        case 'tarea_recurrente': {
          const r = await updateRecurringTask(ctx, repo, {
            id: v.id,
            title: v.titulo,
            notes: v.descripcion,
            projectId: v.proyecto_id,
            goalId: v.meta_id,
            frequency: v.frecuencia,
            nextDueOn: v.desde,
          });
          return r.ok
            ? ok({ tarea_recurrente_id: r.value.id, titulo: r.value.title, frecuencia: r.value.frequency, proxima: r.value.nextDueOn })
            : r;
        }
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
        case 'recurrente': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          if (v.accion === 'confirmar') {
            const r = await confirmRecurringExpense(ctx, deps.finance, {
              id: v.id,
              amountMinor: v.monto != null ? Math.round(v.monto * 100) : undefined,
            });
            return r.ok
              ? ok({ confirmado: v.id, transaccion: r.value.id, monto: money(r.value.baseAmountMinor) })
              : r;
          }
          if (v.accion === 'omitir') {
            const r = await skipRecurringExpense(ctx, deps.finance, v.id);
            return r.ok ? ok({ omitido: v.id, proximo: r.value.nextDueOn }) : r;
          }
          // editar campos
          const r = await updateRecurringExpense(ctx, deps.finance, {
            id: v.id,
            amountMinor: v.monto != null ? Math.round(v.monto * 100) : undefined,
            description: v.descripcion,
            frequency: v.frecuencia,
            nextDueOn: v.desde,
          });
          if (!r.ok) return r;
          if (v.etiquetas) {
            await setRecurringTags(ctx, deps.finance, { id: v.id, tagIds: v.etiquetas });
          }
          return ok({ recurrente_id: r.value.id });
        }
        case 'movimiento': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          // Si cambia de proyecto, el área sale del nuevo proyecto (ADR-026).
          let areaId: string | undefined;
          if (v.proyecto_id) {
            const proj = await repo.getProject(v.proyecto_id);
            if (!proj) return err('NOT_FOUND', 'Indica un proyecto válido (proyecto_id)');
            if (!proj.areaId) return err('RULE_VIOLATION', 'Ese proyecto no tiene área');
            areaId = proj.areaId;
          }
          const r = await updateTransaction(ctx, deps.finance, {
            id: v.id,
            direction: v.direccion ? (v.direccion === 'ingreso' ? 'in' : 'out') : undefined,
            amountMinor: v.monto != null ? Math.round(v.monto * 100) : undefined,
            currency: v.moneda,
            fxRate: v.tasa,
            projectId: v.proyecto_id,
            areaId,
            category: v.categoria,
            description: v.descripcion,
            occurredOn: v.desde,
          });
          if (!r.ok) return r;
          if (v.etiquetas) {
            await setTransactionTags(ctx, deps.finance, { id: v.id, tagIds: v.etiquetas });
          }
          return ok({ actualizado: r.value.id, monto: money(r.value.baseAmountMinor) });
        }
        case 'etiqueta': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await updateTag(ctx, deps.finance, {
            id: v.id,
            name: v.titulo,
            color: v.color_hex,
          });
          return r.ok ? ok({ etiqueta_id: r.value.id, nombre: r.value.name, color: r.value.color }) : r;
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
        case 'tarea_recurrente': {
          const r = await deleteRecurringTask(ctx, repo, v.id);
          return r.ok ? ok({ borrada: v.id }) : r;
        }
        case 'documento': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'La documentación no está disponible');
          const r = await deleteDocument(ctx, deps.structure, v.id);
          return r.ok ? ok({ borrado: v.id }) : r;
        }
        case 'recurrente': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await deleteRecurringExpense(ctx, deps.finance, v.id);
          return r.ok ? ok({ borrado: v.id }) : r;
        }
        case 'movimiento': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await deleteTransaction(ctx, deps.finance, v.id);
          return r.ok ? ok({ borrado: v.id }) : r;
        }
        case 'etiqueta': {
          if (!deps.finance) return err('EXTERNAL_ERROR', 'Finanzas no está disponible');
          const r = await deleteTag(ctx, deps.finance, v.id);
          return r.ok ? ok({ borrada: v.id }) : r;
        }
        case 'area': {
          if (!deps.structure) return err('EXTERNAL_ERROR', 'No disponible');
          const r = await archiveArea(ctx, deps.structure, v.id);
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

    case 'mover_agenda': {
      const p = parse(MoverAgenda, rawInput);
      if (!p.ok) return p;
      if (!deps.listCalendar || !deps.editEvent || !(await calendarReady(deps))) {
        return err('EXTERNAL_ERROR', CAL_OFF);
      }
      const { fecha, minutos } = p.value;
      // En UNA sola llamada: lista el día y desplaza cada evento. El cálculo de la
      // hora nueva lo hace el código (editEvent conserva la duración), no el modelo.
      const eventos = await deps.listCalendar(fecha);
      const movibles = eventos.filter((e) => e.start && !e.allDay);
      let movidos = 0;
      for (const e of movibles) {
        const nuevoInicio = new Date(new Date(e.start!).getTime() + minutos * 60000).toISOString();
        try {
          await deps.editEvent(e.id, { fecha: nuevoInicio });
          movidos++;
        } catch {
          // Si uno falla, sigue con los demás; se reporta cuántos se movieron.
        }
      }
      return ok({ movidos, de_total: eventos.length, minutos, fecha });
    }

    case 'guardar_imagen': {
      const p = parse(GuardarImagen, rawInput);
      if (!p.ok) return p;
      if (!deps.structure) return err('EXTERNAL_ERROR', 'No disponible');
      const r = await saveAttachment(ctx, deps.structure, {
        id: p.value.adjunto_id,
        projectId: p.value.proyecto_id,
        transactionId: p.value.movimiento_id,
        description: p.value.descripcion,
      });
      return r.ok
        ? ok({ guardada: r.value.id, proyecto_id: r.value.projectId, movimiento_id: r.value.transactionId })
        : r;
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
