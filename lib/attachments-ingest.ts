import type { ServerSupabase } from '@/adapters/supabase/server';
import type { ActorContext } from '@/core/types';
import type { InputImage } from '@/agent/loop';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { uploadImage } from '@/adapters/supabase/storage';
import { registerAttachment } from '@/core/structure/attachments';

/** Sube las imágenes entrantes al bucket y registra cada adjunto (saved=false),
 *  devolviendo sus adjunto_id. Si algo falla (p. ej. el bucket aún no existe),
 *  lo registra y sigue: la visión funciona igual, solo no se podrá "guardar". */
export async function ingestImages(
  supabase: ServerSupabase,
  ctx: ActorContext,
  images: InputImage[],
): Promise<string[]> {
  if (images.length === 0) return [];
  const repo = structureRepo(supabase, ctx.userId);
  const ids: string[] = [];
  for (const img of images) {
    try {
      const path = await uploadImage(
        supabase,
        ctx.userId,
        Buffer.from(img.data, 'base64'),
        img.mediaType,
      );
      const r = await registerAttachment(ctx, repo, { storagePath: path, mime: img.mediaType });
      if (r.ok) ids.push(r.value.id);
    } catch (e) {
      console.error('ingestImages:', e);
    }
  }
  return ids;
}

/** Nota que se añade al mensaje del usuario para que el agente pueda referenciar
 *  las imágenes al guardarlas. */
export function adjuntoNote(ids: string[]): string {
  if (ids.length === 0) return '';
  return `\n\n[imágenes adjuntas · adjunto_id: ${ids.join(', ')}]`;
}
