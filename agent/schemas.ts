import { z } from 'zod';

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
  proyecto_id: z.uuid().optional().describe('ID del proyecto, opcional'),
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
    .enum(['agenda_hoy', 'pendientes'])
    .describe('Qué consultar: agenda de hoy o pendientes'),
});

export const Buscar = z.object({
  texto: z.string().trim().min(1).max(100).describe('Texto a buscar'),
});

export const Borrar = z.object({
  tarea_id: z.uuid().describe('ID de la tarea a borrar'),
});

export const COLORES = [
  'rojo', 'naranja', 'amarillo', 'verde', 'turquesa', 'azul',
  'morado', 'lavanda', 'flamingo', 'salvia', 'grafito',
] as const;

export const VerCalendario = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Día YYYY-MM-DD; por defecto hoy'),
});

export const EditarEvento = z.object({
  evento_id: z.string().min(1).describe('ID del evento de Google (de ver_calendario)'),
  titulo: z.string().trim().min(1).max(200).optional().describe('Nuevo título'),
  fecha: Instant.optional().describe('Nueva hora de inicio, ISO con offset'),
  color: z.enum(COLORES).optional().describe('Nuevo color del evento'),
});

export const toolSchemas = {
  crear_tarea: CrearTarea,
  completar: Completar,
  reprogramar: Reprogramar,
  borrar: Borrar,
  consultar: Consultar,
  buscar: Buscar,
  ver_calendario: VerCalendario,
  editar_evento: EditarEvento,
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
  editar_evento: 'Edita un evento de Google Calendar: título, hora o color.',
};

/** Definiciones de herramientas para la API de Anthropic (JSON Schema desde Zod). */
export const toolDefinitions = (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
  name,
  description: descriptions[name],
  input_schema: z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>,
}));
