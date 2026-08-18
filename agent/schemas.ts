import { z } from 'zod';
import { COLOR_NAMES } from '@/lib/calendar-colors';

// Fechas: ISO-8601 con offset explícito (acepta milisegundos). Nunca z.coerce.date().
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const Instant = z.string().regex(ISO_WITH_OFFSET, 'ISO-8601 con offset (ej. 2026-07-24T16:00:00-05:00)');
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Día YYYY-MM-DD');
const RECUR_FREQ = ['semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual'] as const;


const Alcance = z
  .enum(['serie', 'instancia'])
  .describe('serie = toda la serie recurrente; instancia = solo esta ocurrencia');

export const Recurrencia = z.object({
  frecuencia: z
    .enum(['diaria', 'semanal', 'mensual', 'anual', 'ninguna'])
    .describe('Frecuencia de repetición; "ninguna" la quita'),
  intervalo: z.number().int().min(1).optional().describe('Cada cuántos periodos (cada 2 semanas = 2)'),
  dias_semana: z
    .array(z.enum(['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']))
    .optional()
    .describe('Días de la semana (solo frecuencia semanal)'),
  hasta: Ymd.optional().describe('Termina en esta fecha YYYY-MM-DD'),
  veces: z.number().int().min(1).optional().describe('Termina tras N repeticiones'),
});

// ── consultar (lecturas) ────────────────────────────────────────────────────
export const Consultar = z.object({
  vista: z
    .enum([
      'agenda_hoy',
      'agenda',
      'pendientes',
      'estructura',
      'documentacion',
      'resumen_financiero',
      'por_proyecto',
      'movimientos',
      'gastos',
      'recurrentes',
      'etiquetas',
      'por_cobrar',
      'pipeline',
      'conflictos',
      'huecos',
    ])
    .describe(
      'Qué consultar. Trabajo: agenda_hoy (tareas+eventos de hoy), agenda (eventos de un día, usa fecha), ' +
        'pendientes (tareas), estructura (áreas, proyectos y metas con sus IDs), documentacion (el método). ' +
        'Dinero: resumen_financiero, por_proyecto (ingresos/gastos por proyecto), movimientos (lista de ' +
        'ingresos/gastos filtrable por rango de fechas: usa desde/hasta/direccion), gastos, recurrentes ' +
        '(gastos e ingresos recurrentes), etiquetas (lista de etiquetas con sus IDs para poder asignarlas), por_cobrar, pipeline. ' +
        'Agenda: conflictos (solapes próximos 7 días), huecos (ratos libres; usa duracion_min).',
    ),
  fecha: Ymd.optional().describe('Solo vista=agenda: día YYYY-MM-DD (por defecto hoy)'),
  desde: Ymd.optional().describe('Solo vista=movimientos: inicio del rango YYYY-MM-DD (inclusive)'),
  hasta: Ymd.optional().describe('Solo vista=movimientos: fin del rango YYYY-MM-DD (inclusive)'),
  direccion: z
    .enum(['ingreso', 'gasto'])
    .optional()
    .describe('Solo vista=movimientos: filtra a ingresos o gastos'),
  proyecto_id: z.uuid().optional().describe('Solo vista=documentacion: limita a ese proyecto'),
  duracion_min: z.number().int().min(15).max(480).optional().describe('Solo vista=huecos: minutos (60 def)'),
});

export const Buscar = z.object({
  texto: z.string().trim().min(1).max(100).describe('Texto a buscar (tareas)'),
});

// ── crear (unión por tipo) ──────────────────────────────────────────────────
export const Crear = z
  .object({
    tipo: z
      .enum([
        'tarea',
        'evento',
        'proyecto',
        'meta',
        'area',
        'meta_dinero',
        'documento',
        'movimiento',
        'recurrente',
        'etiqueta',
      ])
      .describe('Qué crear'),
    titulo: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('Título/nombre. Requerido para: tarea, evento, proyecto, meta, area, documento, etiqueta'),
    area_id: z.uuid().optional().describe('Área. Requerido: proyecto. Opcional: documento'),
    proyecto_id: z
      .uuid()
      .optional()
      .describe(
        'Proyecto. El dinero (movimiento y meta_dinero) SIEMPRE se atribuye a un proyecto. Requerido: meta, meta_dinero, movimiento. Opcional: tarea, evento, documento',
      ),
    meta_id: z.uuid().optional().describe('Meta. Opcional: tarea, evento'),
    fecha: Instant.optional().describe('Inicio con offset. tarea (vence, opcional), evento (inicio, requerido)'),
    desde: Ymd.optional().describe('Inicio YYYY-MM-DD. meta / meta_dinero'),
    hasta: Ymd.optional().describe('Fin/cumplimiento YYYY-MM-DD. meta / meta_dinero'),
    objetivo: z.number().positive().optional().describe('Cantidad objetivo. meta (nº) / meta_dinero (pesos)'),
    metrica: z.enum(['money_in', 'money_net']).optional().describe('Solo meta_dinero: ingresos o neto'),
    clase: z.enum(['negocio', 'personal']).optional().describe('Solo area: negocio o personal'),
    direccion: z
      .enum(['ingreso', 'gasto'])
      .optional()
      .describe('movimiento: ingreso o gasto. recurrente: ingreso (recurrente de ingreso) o gasto (por defecto gasto)'),
    monto: z.number().positive().optional().describe('movimiento / recurrente: en la moneda, NO centavos (ej. 50000, 12.5)'),
    moneda: z.enum(['COP', 'USD']).optional().describe('Solo movimiento (por defecto COP)'),
    tasa: z.number().positive().optional().describe('Solo movimiento en USD: COP por 1 USD'),
    categoria: z.string().trim().max(80).optional().describe('movimiento gasto / recurrente (ej. almuerzo, arriendo)'),
    frecuencia: z.enum(RECUR_FREQ).optional().describe('Solo recurrente: cada cuánto se repite'),
    color_hex: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional()
      .describe('Solo etiqueta: color hex (ej. #f97316). Opcional'),
    etiquetas: z
      .array(z.uuid())
      .max(20)
      .optional()
      .describe('movimiento / recurrente: IDs de etiquetas a asignar (obtén los IDs con consultar etiquetas)'),
    contenido: z.string().max(100_000).optional().describe('Solo documento: cuerpo (markdown)'),
    clase_doc: z.enum(['proceso', 'preferencia', 'nota']).optional().describe('Solo documento (por defecto nota)'),
    descripcion: z.string().max(5000).optional().describe('evento: notas · movimiento: concepto (ej. "almuerzo con cliente"), máx 500'),
    color: z.enum(COLOR_NAMES).optional().describe('Solo evento'),
    duracion_min: z.number().int().min(5).max(1440).optional().describe('Solo evento: minutos (30 def)'),
  })
  .refine(
    (d) => {
      switch (d.tipo) {
        case 'tarea':
          return !!d.titulo;
        case 'evento':
          return !!d.titulo && !!d.fecha;
        case 'proyecto':
          return !!d.titulo && !!d.area_id;
        case 'meta':
          return !!d.titulo && !!d.proyecto_id;
        case 'area':
          return !!d.titulo && !!d.clase;
        case 'meta_dinero':
          return (
            !!d.titulo &&
            !!d.metrica &&
            d.objetivo != null &&
            !!d.proyecto_id &&
            !!d.desde &&
            !!d.hasta
          );
        case 'documento':
          return !!d.titulo;
        case 'movimiento':
          return !!d.direccion && d.monto != null && !!d.proyecto_id;
        case 'recurrente':
          return !!d.proyecto_id && d.monto != null && !!d.frecuencia && !!d.desde;
        case 'etiqueta':
          return !!d.titulo;
        default:
          return false;
      }
    },
    { message: 'Faltan campos obligatorios para ese tipo (revisa los marcados como requeridos).' },
  );

// ── actualizar (unión por tipo + acción) ────────────────────────────────────
export const Actualizar = z
  .object({
    tipo: z
      .enum(['tarea', 'evento', 'meta', 'proyecto', 'area', 'documento', 'recurrente', 'movimiento', 'etiqueta'])
      .describe('Qué actualizar'),
    id: z.string().min(1).describe('ID de la entidad (uuid; para evento es el id de Google de consultar agenda)'),
    accion: z
      .enum([
        'completar',
        'reabrir',
        'reprogramar',
        'descripcion',
        'mover',
        'factores',
        'editar',
        'anexar',
        'fijar',
        'confirmar',
        'omitir',
      ])
      .optional()
      .describe(
        'tarea: completar|reabrir|reprogramar|descripcion|mover · meta: factores|descripcion · ' +
          'proyecto/area: descripcion · documento: editar|anexar|fijar · evento: editar · ' +
          'recurrente: confirmar (registra el gasto y avanza) | omitir (avanza sin registrar); sin accion = editar campos',
      ),
    monto: z
      .number()
      .positive()
      .optional()
      .describe('recurrente: monto nuevo (editar) o monto real al confirmar si cambió'),
    frecuencia: z.enum(RECUR_FREQ).optional().describe('recurrente: nueva frecuencia'),
    titulo: z.string().trim().min(1).max(200).optional().describe('Nuevo título/nombre (documento editar / evento / etiqueta renombrar)'),
    descripcion: z
      .string()
      .max(100_000)
      .optional()
      .describe('Texto: descripción (tarea/proyecto/area/meta) o contenido (documento editar/anexar) o notas (evento)'),
    fecha: Instant.optional().describe('tarea reprogramar / evento nueva hora, ISO con offset'),
    proyecto_id: z.uuid().optional().describe('tarea mover · movimiento: nuevo proyecto'),
    meta_id: z.uuid().optional().describe('tarea mover'),
    direccion: z.enum(['ingreso', 'gasto']).optional().describe('movimiento: cambiar ingreso/gasto'),
    moneda: z.enum(['COP', 'USD']).optional().describe('movimiento: cambiar moneda'),
    tasa: z.number().positive().optional().describe('movimiento: tasa COP por USD (si moneda=USD)'),
    categoria: z.string().trim().max(80).optional().describe('movimiento: categoría'),
    color_hex: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional()
      .describe('etiqueta: nuevo color hex (ej. #22c55e)'),
    etiquetas: z
      .array(z.uuid())
      .max(20)
      .optional()
      .describe('movimiento / recurrente: REEMPLAZA sus etiquetas por estos IDs (obtén IDs con consultar etiquetas). Lista vacía = quitar todas'),
    objetivo: z.number().positive().optional().describe('meta factores: cantidad objetivo'),
    desde: Ymd.optional().describe('meta factores: inicio'),
    hasta: Ymd.optional().describe('meta factores: cumplimiento'),
    fijado: z.boolean().optional().describe('documento: fijar/desfijar'),
    color: z.enum(COLOR_NAMES).optional().describe('evento'),
    recurrencia: Recurrencia.optional().describe('evento'),
    alcance: Alcance.optional().describe('evento: serie o instancia'),
  })
  .refine((d) => d.tipo !== 'tarea' || !!d.accion, {
    message: 'Para tipo=tarea indica accion (completar/reabrir/reprogramar/descripcion/mover)',
    path: ['accion'],
  })
  .refine((d) => d.tipo !== 'documento' || !!d.accion, {
    message: 'Para tipo=documento indica accion (editar/anexar/fijar)',
    path: ['accion'],
  });

// ── archivar / borrar (unión por tipo) ──────────────────────────────────────
export const Archivar = z.object({
  tipo: z
    .enum(['tarea', 'evento', 'documento', 'area', 'recurrente', 'movimiento', 'etiqueta'])
    .describe('Qué eliminar/archivar. tarea/evento/documento/recurrente/movimiento/etiqueta se borran; area se archiva'),
  id: z.string().min(1).describe('ID (uuid; para evento el id de Google)'),
  alcance: Alcance.optional().describe('Solo evento: serie o instancia (por defecto serie)'),
});

// ── deshacer / guardar_imagen ───────────────────────────────────────────────
export const Deshacer = z.object({});

export const GuardarImagen = z.object({
  adjunto_id: z.uuid().describe('El adjunto_id EXACTO que aparece en el mensaje del usuario'),
  proyecto_id: z.uuid().optional().describe('Proyecto donde guardarla (usa consultar estructura)'),
  movimiento_id: z
    .uuid()
    .optional()
    .describe('Movimiento (transacción) al que enlazar como comprobante; usa el id que devolvió crear movimiento'),
  descripcion: z.string().trim().max(500).optional().describe('Qué es la imagen (ej. "recibo del almuerzo")'),
});

// Operación en bloque: mover todos los eventos de un día de una sola vez, para no
// tener que editar evento por evento (que agota el presupuesto de iteraciones).
export const MoverAgenda = z.object({
  fecha: Ymd.describe('Día cuyos eventos mover (YYYY-MM-DD). Para "hoy" usa la fecha de hoy.'),
  minutos: z
    .number()
    .int()
    .describe(
      'Minutos a desplazar TODOS los eventos de ese día. Positivo = más tarde, negativo = más temprano (ej. 60 = una hora más tarde, -30 = media hora antes). La duración de cada evento se conserva.',
    ),
});

export const toolSchemas = {
  consultar: Consultar,
  buscar: Buscar,
  crear: Crear,
  actualizar: Actualizar,
  archivar: Archivar,
  mover_agenda: MoverAgenda,
  guardar_imagen: GuardarImagen,
  deshacer: Deshacer,
} as const;

export type ToolName = keyof typeof toolSchemas;
export const isToolName = (n: string): n is ToolName => n in toolSchemas;

const descriptions: Record<ToolName, string> = {
  consultar:
    'Lee información: agenda_hoy, agenda (día), pendientes, estructura (IDs de áreas/proyectos/metas), ' +
    'documentacion, resumen_financiero, por_proyecto, gastos, recurrentes (gastos e ingresos recurrentes y cuáles vencen), ' +
    'etiquetas (lista con IDs para asignarlas), por_cobrar, pipeline, conflictos, huecos.',
  buscar: 'Busca por texto en las tareas.',
  crear:
    'Crea CUALQUIER cosa del dominio según tipo: tarea, evento (Google Calendar), proyecto, meta, ' +
    'area, meta_dinero, documento (del método), movimiento (ingreso/gasto), recurrente (gasto o ingreso que se ' +
    'repite; usa direccion) o etiqueta (para clasificar movimientos). El dinero (movimiento, meta_dinero, recurrente) ' +
    'SIEMPRE se atribuye a un proyecto (proyecto_id). Para asignar etiquetas a un movimiento/recurrente al crearlo, pasa sus IDs en etiquetas.',
  actualizar:
    'Actualiza según tipo: tarea (completar/reabrir/reprogramar/descripción/mover), meta (factores/' +
    'descripción), proyecto/area (descripción), documento (editar/anexar/fijar), evento (título/hora/color/recurrencia), ' +
    'recurrente (confirmar = registra el movimiento y avanza la fecha; omitir = avanza sin registrar; o edita monto/frecuencia/fecha), ' +
    'movimiento (monto/proyecto/categoría/etiquetas), etiqueta (renombrar con titulo o recolorear con color_hex).',
  archivar:
    'Elimina o archiva según tipo: tarea/evento/documento/recurrente/movimiento/etiqueta se borran; area se archiva. ' +
    'Borrar una etiqueta la quita de todos sus movimientos.',
  mover_agenda:
    'Mueve TODOS los eventos de un día de una vez (una sola llamada). Úsalo cuando el usuario ' +
    'pida correr/adelantar/atrasar toda la agenda de un día (ej. "mueve todo lo de hoy una hora más tarde" → fecha=hoy, minutos=60). No edites evento por evento para esto.',
  guardar_imagen:
    'Guarda una imagen que el usuario adjuntó (usa el adjunto_id EXACTO del mensaje); opcional: enlazar a proyecto o, como comprobante, a un movimiento (movimiento_id).',
  deshacer:
    'Deshace la última acción reciente (crear/renombrar tarea o documento, últimos 5 min). Si no es reversible, explica.',
};

/** Definiciones de herramientas para la API de Anthropic (JSON Schema desde Zod). */
export const toolDefinitions = (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
  name,
  description: descriptions[name],
  input_schema: z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>,
}));
