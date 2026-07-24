import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { requireContext } from '@/lib/auth';
import { buildAuthUrl } from '@/adapters/google/oauth';

// Inicia la conexión con Google Calendar. Debe estar logueado.
export async function GET() {
  await requireContext();
  const state = randomBytes(16).toString('hex');
  const jar = await cookies();
  jar.set('g_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return NextResponse.redirect(buildAuthUrl(state));
}
