import { z } from 'zod';

export const AreaCreate = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  kind: z.enum(['negocio', 'personal']),
});
export type AreaCreateInput = z.infer<typeof AreaCreate>;

export const ProjectCreate = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  areaId: z.uuid(),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreate>;

// Documentación del método: procesos, preferencias y notas. Editable por el usuario
// y por el agente. Alcance por area_id/project_id opcionales (sin ambos = global).
export const DOCUMENT_KINDS = ['proceso', 'preferencia', 'nota'] as const;

export const DocumentCreate = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  content: z.string().max(100_000).optional(),
  kind: z.enum(DOCUMENT_KINDS).default('nota'),
  areaId: z.uuid().optional(),
  projectId: z.uuid().optional(),
});
export type DocumentCreateInput = z.infer<typeof DocumentCreate>;

export const DocumentUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(100_000).optional(),
  pinned: z.boolean().optional(),
});
export type DocumentUpdateInput = z.infer<typeof DocumentUpdate>;

export const DocumentAppend = z.object({
  id: z.uuid(),
  content: z.string().trim().min(1, 'Nada que anexar').max(100_000),
});
export type DocumentAppendInput = z.infer<typeof DocumentAppend>;
