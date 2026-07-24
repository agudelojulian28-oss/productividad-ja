import type { SupabaseClient } from '@supabase/supabase-js';

/** Lee el refresh token cifrado de Google (bytea en formato hex `\x...`), o null. */
export async function getGoogleTokenCipher(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('integrations')
    .select('encrypted_refresh_token')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  if (!data) return null;
  return (data as { encrypted_refresh_token: string }).encrypted_refresh_token;
}
