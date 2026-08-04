import { z } from 'zod';
import { COLOR_NAMES } from '@/lib/calendar-colors';

// Fechas: ISO-8601 con offset explícito (acepta milisegundos). Nunca z.coerce.date().
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const Instant = z.string().regex(ISO_WITH_OFFSET, 'ISO-8601 con offset (ej. 2026-07-24T16:00:00-05:00)');
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Día YYYY-MM-DD');

const INCOME_MODELS = ['servicio', 'producto', 'suscripcion', 'empleo', 'inversion', 'otro'] as const;

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
      'por_fuente',
      'gastos',
      'por_cobrar',
      'pipeline',
      'conflictos',
      'huecos',
    ])
    .describe(
      'Qué consultar. Trabajo: agenda_hoy (tareas+eventos de hoy), agenda (eventos de un día, usa fecha), ' +
        'pendientes (tareas), estructura (áreas, proyectos y metas con sus IDs), documentacion (el método). ' +
        'Dinero: resumen_financiero, por_fuente, gastos, por_cobrar, pipeline. ' +
        'Agenda: conflictos (solapes próximos 7 días), huecos (ratos libres; usa duracion_min).',
    ),
  fecha: Ymd.optional().describe('Solo vista=agenda: día YYYY-MM-DD (por defecto hoy)'),
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
        'fuente',
        'meta_dinero',
        'documento',
        'movimiento',
      ])
      .describe('Qué crear'),
    titulo: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('Título/nombre. Requerido para: tarea, evento, proyecto, meta, area, fuente, documento'),
    area_id: z.uuid().optional().describe('Área. Requerido: proyecto, fuente. Opcional: meta_dinero, documento'),
    proyecto_id: z.uuid().optional().describe('Proyecto. Requerido: meta, movimiento (el dinero se atribuye al proyecto). Opcional: tarea, evento, documento'),
    meta_id: z.uuid().optional().describe('Meta. Opcional: tarea, evento'),
    fuente_id: z.uuid().optional().describe('Fuente de ingreso (legado). Solo meta_dinero (alcance)'),
    fecha: Instant.optional().describe('Inicio con offset. tarea (vence, opcional), evento (inicio, requerido)'),
    desde: Ymd.optional().describe('Inicio YYYY-MM-DD. meta / meta_dinero'),
    hasta: Ymd.optional().describe('Fin/cumplimiento YYYY-MM-DD. meta / meta_dinero'),
    objetivo: z.number().positive().optional().describe('Cantidad objetivo. meta (nº) / meta_dinero (pesos)'),
    metrica: z.enum(['money_in', 'money_net']).optional().describe('Solo meta_dinero: ingresos o neto'),
    clase: z.enum(['negocio', 'personal']).optional().describe('Solo area: negocio o personal'),
    modelo: z.enum(INCOME_MODELS).optional().describe('Solo fuente: servicio/producto/suscripcion/empleo/inversion/otro'),
    direccion: z.enum(['ingreso', 'gasto']).optional().describe('Solo movimiento'),
    monto: z.number().positive().optional().describe('Solo movimiento: en la moneda, NO centavos (ej. 50000, 12.5)'),
    moneda: z.enum(['COP', 'USD']).optional().describe('Solo movimiento (por defecto COP)'),
    tasa: z.number().positive().optional().describe('Solo movimiento en USD: COP por 1 USD'),
    categoria: z.string().trim().max(80).optional().describe('Solo movimiento gasto (ej. almuerzo)'),
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
        case 'fuente':
          return !!d.titulo && !!d.area_id && !!d.modelo;
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
        default:
          return false;
      }
    },
    { message: 'Faltan campos obligatorios para ese tipo (revisa los marcados como requeridos).' },
  );

// ── actualizar (unión por tipo + acción) ────────────────────────────────────
export const Actualizar = z
  .object({
    tipo: z.enum(['tarea', 'evento', 'meta', 'proyecto', 'area', 'documento']).describe('Qué actualizar'),
    id: z.string().min(1).describe('ID de la entidad (uuid; para evento es el id de Google de consultar agenda)'),
    accion: z
      .enum(['completar', 'reabrir', 'reprogramar', 'descripcion', 'mover', 'factores', 'editar', 'anexar', 'fijar'])
      .optional()
      .describe(
        'tarea: completar|reabrir|reprogramar|descripcion|mover · meta: factores|descripcion · ' +
          'proyecto/area: descripcion · documento: editar|anexar|fijar · evento: editar',
      ),
    titulo: z.string().trim().min(1).max(200).optional().describe('Nuevo título (documento editar / evento)'),
    descripcion: z
      .string()
      .max(100_000)
      .optional()
      .describe('Texto: descripción (tarea/proyecto/area/meta) o contenido (documento editar/anexar) o notas (evento)'),
    fecha: Instant.optional().describe('tarea reprogramar / evento nueva hora, ISO con offset'),
    proyecto_id: z.uuid().optional().describe('tarea mover'),
    meta_id: z.uuid().optional().describe('tarea mover'),
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
    .enum(['tarea', 'evento', 'documento', 'area', 'fuente'])
    .describe('Qué eliminar/archivar. tarea/evento/documento se borran; area/fuente se archivan'),
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

export const toolSchemas = {
  consultar: Consultar,
  buscar: Buscar,
  crear: Crear,
  actualizar: Actualizar,
  archivar: Archivar,
  guardar_imagen: GuardarImagen,
  deshacer: Deshacer,
} as const;

export type ToolName = keyof typeof toolSchemas;
export const isToolName = (n: string): n is ToolName => n in toolSchemas;

const descriptions: Record<ToolName, string> = {
  consultar:
    'Lee información: agenda_hoy, agenda (día), pendientes, estructura (IDs de áreas/proyectos/metas), ' +
    'documentacion, resumen_financiero, por_fuente, gastos, por_cobrar, pipeline, conflictos, huecos.',
  buscar: 'Busca por texto en las tareas.',
  crear:
    'Crea CUALQUIER cosa del dominio según tipo: tarea, evento (Google Calendar), proyecto, meta, ' +
    'area, fuente (de ingreso), meta_dinero, documento (del método) o movimiento (ingreso/gasto).',
  actualizar:
    'Actualiza según tipo: tarea (completar/reabrir/reprogramar/descripción/mover), meta (factores/' +
    'descripción), proyecto/area (descripción), documento (editar/anexar/fijar), evento (título/hora/color/recurrencia).',
  archivar:
    'Elimina o archiva según tipo: tarea/evento/documento se borran; area/fuente se archivan.',
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
