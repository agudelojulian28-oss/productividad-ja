import { z } from 'zod';

// Fechas: ISO-8601 con offset explícito. Nunca z.coerce.date() (interpreta en UTC
// y corre todo 5 horas). Ver docs/arquitectura-v2.md §6.2.
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

export const Instant = z
  .string()
  .regex(ISO_WITH_OFFSET, 'Debe ser ISO-8601 con offset (ej. 2026-07-24T16:00:00-05:00)')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha inválida');

export const TaskCreate = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  notes: z.string().max(5000).optional(),
  projectId: z.uuid().optional(),
  goalId: z.uuid().optional(),
  dueAt: Instant.optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreate>;

export const GoalCreate = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
});
export type GoalCreateInput = z.infer<typeof GoalCreate>;

export const TaskReschedule = z.object({
  id: z.uuid(),
  dueAt: Instant,
});
export type TaskRescheduleInput = z.infer<typeof TaskReschedule>;
