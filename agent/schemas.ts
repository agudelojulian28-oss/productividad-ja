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

export const Estructura = z.object({});

export const Completar = z.object({
  tarea_id: z.uuid().describe('ID de la tarea a completar'),
});

export const Reprogramar = z.object({
  tarea_id: z.uuid().describe('ID de la tarea'),
  fecha: Instant.describe('Nueva fecha y hora con offset'),
});

export const Consultar = z.object({
  vista: z
    .enum(['agenda_hoy', 'pendientes'])
    .describe('Qué consultar: agenda de hoy o pendientes'),
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
  estructura: Estructura,
} as const;

export type ToolName = keyof typeof toolSchemas;
export const isToolName = (n: string): n is ToolName => n in toolSchemas;

const descriptions: Record<ToolName, string> = {
  crear_tarea: 'Crea una tarea. Acepta fecha/hora y proyecto opcionales.',
  completar: 'Marca una tarea como completada.',
  reprogramar: 'Cambia la fecha/hora de una tarea.',
  borrar: 'Borra una tarea de forma permanente.',
  consultar: 'Consulta la agenda de hoy o la lista de pendientes (solo tareas).',
  buscar: 'Busca por texto en las tareas.',
  ver_calendario: 'Lista los eventos de Google Calendar de un día (por defecto hoy).',
  crear_evento: 'Crea un EVENTO en Google Calendar (algo agendado con hora). No es una tarea.',
  editar_evento: 'Edita un evento de Google Calendar: título, hora, color o recurrencia.',
  borrar_evento: 'Borra un evento de Google Calendar (serie completa o una instancia).',
  estructura: 'Lista los proyectos del usuario y sus metas (para ubicar tareas). Sin parámetros.',
};

/** Definiciones de herramientas para la API de Anthropic (JSON Schema desde Zod). */
export const toolDefinitions = (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
  name,
  description: descriptions[name],
  input_schema: z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>,
}));
