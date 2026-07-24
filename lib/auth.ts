import { createClient } from '@/adapters/supabase/server';
import type { ActorContext } from '@/core/types';

/** Obtiene el cliente Supabase con la sesión del usuario y su contexto de actor.
 *  Crea el perfil (zona horaria) en el primer acceso. Lanza si no hay sesión
 *  (el middleware ya protege; esto es defensa en profundidad). */
export async function requireContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  ctx: ActorContext;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();

  let tz = (data as { timezone: string } | null)?.timezone;
  if (!tz) {
    await supabase.from('profiles').upsert({ user_id: user.id });
    tz = 'America/Bogota';
  }

  return { supabase, ctx: { userId: user.id, actor: 'user', channel: 'web', tz } };
}
