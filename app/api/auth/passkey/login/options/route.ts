import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  generateAuthenticationOptions,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { createUserClient } from '@/adapters/supabase/as-user';
import { rpID, challengeCookie } from '@/lib/webauthn';

export const runtime = 'nodejs';

/** Pública: emite el reto de autenticación. Protegida por la aserción WebAuthn
 *  posterior. Acotada al usuario único (ALLOWED_USER_ID). */
export async function POST() {
  const userId = process.env.ALLOWED_USER_ID;
  if (!userId) return new NextResponse('config', { status: 500 });

  const db = createUserClient(userId, { channel: 'web' });
  const { data: creds } = await db
    .from('webauthn_credentials')
    .select('credential_id,transports');
  const list = (creds as { credential_id: string; transports: string[] }[] | null) ?? [];
  if (list.length === 0) return new NextResponse('sin credenciales', { status: 404 });

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: list.map((c) => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
  });

  const jar = await cookies();
  const ck = challengeCookie(options.challenge);
  jar.set(ck.name, ck.value, ck.options);
  return NextResponse.json(options);
}
