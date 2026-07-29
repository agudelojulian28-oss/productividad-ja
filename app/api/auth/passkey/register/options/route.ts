import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  generateRegistrationOptions,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { createClient } from '@/adapters/supabase/server';
import { rpID, rpName, challengeCookie } from '@/lib/webauthn';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('no autorizado', { status: 401 });

  const { data: creds } = await supabase
    .from('webauthn_credentials')
    .select('credential_id,transports');
  const existing = (creds as { credential_id: string; transports: string[] }[] | null) ?? [];

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email ?? 'usuario',
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  const jar = await cookies();
  const ck = challengeCookie(options.challenge);
  jar.set(ck.name, ck.value, ck.options);
  return NextResponse.json(options);
}
