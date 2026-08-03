import crypto from 'node:crypto';
import type { ServerSupabase } from './server';

const BUCKET = 'attachments';

function extFor(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/** Sube una imagen al bucket privado bajo {userId}/{uuid}.ext (RLS por carpeta).
 *  Devuelve la ruta guardada. */
export async function uploadImage(
  supabase: ServerSupabase,
  userId: string,
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${extFor(mime)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** URL firmada temporal para ver una imagen del bucket privado. null si falla. */
export async function signedUrl(
  supabase: ServerSupabase,
  path: string,
  expiresSec = 3600,
): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  return data?.signedUrl ?? null;
}
