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
