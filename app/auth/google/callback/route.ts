import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireContext } from '@/lib/auth';
import { exchangeCode, CALENDAR_SCOPE } from '@/adapters/google/oauth';
import { encryptToken } from '@/lib/crypto';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const jar = await cookies();
  const expected = jar.get('g_oauth_state')?.value;
  if (!code || !state || state !== expected) {
    return NextResponse.redirect(`${origin}/ajustes?google=error`);
  }

  const { supabase, ctx } = await requireContext();
  const tokens = await exchangeCode(code);

  if (!tokens.refreshToken) {
    return NextResponse.redirect(`${origin}/ajustes?google=no_refresh`);
  }

  const { error } = await supabase.from('integrations').upsert(
    {
      user_id: ctx.userId,
      provider: 'google',
      encrypted_refresh_token: encryptToken(tokens.refreshToken),
      scopes: [CALENDAR_SCOPE],
      expires_at: tokens.expiresAt,
    },
    { onConflict: 'user_id,provider' },
  );

  jar.delete('g_oauth_state');
  return NextResponse.redirect(`${origin}/ajustes?google=${error ? 'error' : 'ok'}`);
}
