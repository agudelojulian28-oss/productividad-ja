import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Cliente `service_role` (bypasea RLS). ÚNICO uso permitido: INSERT en `inbox`
 *  desde los webhooks de canal (regla no negociable #1, ADR-017). La regla de
 *  dependency-cruiser `admin-only-from-channels` impide importarlo desde otro sitio.
 *  Nunca lo uses para el reclamo del inbox ni para lógica de negocio. */
export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Falta SUPABASE_SECRET_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
