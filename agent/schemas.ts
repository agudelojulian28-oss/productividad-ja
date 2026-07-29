import { z } from 'zod';
import { COLOR_NAMES } from '@/lib/calendar-colors';

// Fechas: ISO-8601 con offset explícito (acepta milisegundos). Nunca z.coerce.date().
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const Instant = z
  .string()
  .regex(ISO_WITH_OFFSET, 'ISO-8601 con offset (ej. 2026-07-24T16:00:00-05:00)');

// Las 5 herramientas de la Etapa 2. Un schema por herramienta.
export const CrearTarea = z.object({
  titulo: z.string().trim().min(1).max(200).describe('Título de la tarea'),
  fecha: Instant.optional().describe('Fecha y hora con offset, opcional'),
  proyecto_id: z.uuid().optional().describe('ID del proyecto (de estructura)'),
  meta_id: z.uuid().optional().describe('ID de la meta, opcional (de estructura)'),
});

export const Completar = z.object({
  tarea_id: z.uuid().describe('ID de la tarea a completar'),
});

export const Reprogramar = z.object({
  tarea_id: z.uuid().describe('ID de la tarea'),
  fecha: Instant.describe('Nueva fecha y hora con offset'),
});

export const Consultar = z.object({
  vista: z
    .enum([
      'agenda_hoy',
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
      'Qué consultar. Trabajo: agenda_hoy, pendientes (tareas), estructura (proyectos y metas), ' +
        'documentacion (el método de Julián: procesos, preferencias y notas). ' +
        'Dinero: resumen_financiero (entró/salió/neto del mes), por_fuente, gastos (top del mes), ' +
        'por_cobrar y pipeline (ventas, llegan en la Etapa 5). ' +
        'Agenda: conflictos (eventos que se solapan en los próximos 7 días), ' +
        'huecos (ratos libres para agendar; usa duracion_min).',
    ),
  proyecto_id: z
    .uuid()
    .optional()
    .describe('Solo para vista=documentacion: limita a los documentos de ese proyecto'),
  duracion_min: z
    .number()
    .int()
    .min(15)
    .max(480)
    .optional()
    .describe('Solo para vista=huecos: duración deseada del hueco en minutos (60 por defecto)'),
});

// Dinero al agente: el monto va en la moneda indicada (pesos o dólares), no en centavos.
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Día YYYY-MM-DD');
export const RegistrarMovimiento = z.object({
  tipo: z.enum(['ingreso', 'gasto']).describe('ingreso = entró plata; gasto = salió'),
  monto: z
    .number()
    .positive()
    .describe('Monto en la moneda indicada (pesos o dólares), NO en centavos. Ej. 50000, 12.5'),
  moneda: z.enum(['COP', 'USD']).default('COP').describe('Moneda del monto'),
  area_id: z.uuid().describe('Área a la que pertenece (usa consultar estructura para el ID)'),
  fuente_id: z
    .uuid()
    .optional()
    .describe('Fuente de ingreso (obligatoria si tipo=ingreso; usa consultar por_fuente)'),
  categoria: z.string().trim().max(80).optional().describe('Categoría del gasto (ej. almuerzo)'),
  fecha: Ymd.optional().describe('Día YYYY-MM-DD; por defecto hoy'),
  tasa: z
    .number()
    .positive()
    .optional()
    .describe('COP por 1 USD (obligatoria si moneda=USD). Se congela al registrar.'),
});

export const Buscar = z.object({
  texto: z.string().trim().min(1).max(100).describe('Texto a buscar'),
});

export const Borrar = z.object({
  tarea_id: z.uuid().describe('ID de la tarea a borrar'),
});

export const VerCalendario = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Día YYYY-MM-DD; por defecto hoy'),
});

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
    .describe('Días de la semana (solo para frecuencia semanal)'),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Termina en esta fecha YYYY-MM-DD'),
  veces: z.number().int().min(1).optional().describe('Termina tras N repeticiones'),
});

export const CrearEvento = z.object({
  titulo: z.string().trim().min(1).max(200).describe('Título del evento'),
  fecha: Instant.describe('Inicio del evento, ISO-8601 con offset'),
  duracion_min: z.number().int().min(5).max(1440).optional().describe('Duración en minutos (30 por defecto)'),
  color: z.enum(COLOR_NAMES).optional().describe('Color del evento'),
  descripcion: z.string().max(5000).optional().describe('Descripción/notas del evento'),
  proyecto_id: z.uuid().optional().describe('Proyecto al que pertenece (de estructura)'),
  meta_id: z.uuid().optional().describe('Meta a la que pertenece (de estructura)'),
});

export const EditarEvento = z.object({
  evento_id: z.string().min(1).describe('ID del evento de Google (de ver_calendario)'),
  titulo: z.string().trim().min(1).max(200).optional().describe('Nuevo título'),
  fecha: Instant.optional().describe('Nueva hora de inicio, ISO con offset'),
  color: z.enum(COLOR_NAMES).optional().describe('Nuevo color del evento'),
  recurrencia: Recurrencia.optional().describe('Nueva regla de repetición del evento'),
  alcance: Alcance.optional().describe('A qué aplica el cambio; por defecto la serie si tocas recurrencia'),
});

export const BorrarEvento = z.object({
  evento_id: z.string().min(1).describe('ID del evento de Google (de ver_calendario)'),
  alcance: Alcance.optional().describe('Por defecto borra la serie completa si es recurrente'),
});

// Documentar el método: crear un documento nuevo o anexar a uno existente. El agente
// documenta de forma aditiva; nunca borra. author='agente' lo fija el runtime, no el modelo.
export const Documentar = z
  .object({
    modo: z.enum(['crear', 'anexar']).describe('crear un documento nuevo, o anexar a uno existente'),
    contenido: z.string().trim().min(1).max(100_000).describe('El texto a documentar (markdown simple)'),
    titulo: z.string().trim().min(1).max(200).optional().describe('Título (obligatorio si modo=crear)'),
    tipo: z.enum(['proceso', 'preferencia', 'nota']).optional().describe('Tipo del documento nuevo'),
    proyecto_id: z.uuid().optional().describe('Proyecto al que pertenece (de consultar estructura)'),
    area_id: z.uuid().optional().describe('Área a la que pertenece'),
    doc_id: z.uuid().optional().describe('ID del documento a anexar (obligatorio si modo=anexar)'),
  })
  .refine((d) => d.modo !== 'crear' || !!d.titulo, {
    message: 'Crear un documento necesita título',
    path: ['titulo'],
  })
  .refine((d) => d.modo !== 'anexar' || !!d.doc_id, {
    message: 'Anexar necesita el doc_id',
    path: ['doc_id'],
  });

// Deshacer la última acción (alcance acotado, v2 §6.5). Sin parámetros: siempre
// opera sobre la última mutación del usuario.
export const Deshacer = z.object({});

export const toolSchemas = {
  crear_tarea: CrearTarea,
  completar: Completar,
  reprogramar: Reprogramar,
  borrar: Borrar,
  consultar: Consultar,
  buscar: Buscar,
  ver_calendario: VerCalendario,
  crear_evento: CrearEvento,
  editar_evento: EditarEvento,
  borrar_evento: BorrarEvento,
  registrar_movimiento: RegistrarMovimiento,
  documentar: Documentar,
  deshacer: Deshacer,
} as const;

export type ToolName = keyof typeof toolSchemas;
export const isToolName = (n: string): n is ToolName => n in toolSchemas;

const descriptions: Record<ToolName, string> = {
  crear_tarea: 'Crea una tarea. Acepta fecha/hora y proyecto opcionales.',
  completar: 'Marca una tarea como completada.',
  reprogramar: 'Cambia la fecha/hora de una tarea.',
  borrar: 'Borra una tarea de forma permanente.',
  consultar:
    'Consulta una vista: trabajo (agenda_hoy, pendientes, estructura=proyectos y metas), ' +
    'dinero (resumen_financiero, por_fuente, gastos, por_cobrar, pipeline) o ' +
    'agenda (conflictos=solapes, huecos=ratos libres).',
  buscar: 'Busca por texto en las tareas.',
  ver_calendario: 'Lista los eventos de Google Calendar de un día (por defecto hoy).',
  crear_evento: 'Crea un EVENTO en Google Calendar (algo agendado con hora). No es una tarea.',
  editar_evento: 'Edita un evento de Google Calendar: título, hora, color o recurrencia.',
  borrar_evento: 'Borra un evento de Google Calendar (serie completa o una instancia).',
  registrar_movimiento:
    'Registra un movimiento de dinero (ingreso o gasto), en COP o USD (con tasa). ' +
    'El monto va en la moneda, no en centavos.',
  documentar:
    'Documenta el método de Julián: crea un documento nuevo o anexa a uno existente ' +
    '(proceso, preferencia o nota). Aditivo; no borra.',
  deshacer:
    'Deshace la última acción reciente (crear/renombrar una tarea o documento, últimos ' +
    '5 minutos). Si no es reversible, explica por qué.',
};

/** Definiciones de herramientas para la API de Anthropic (JSON Schema desde Zod). */
export const toolDefinitions = (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
  name,
  description: descriptions[name],
  input_schema: z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>,
}));
