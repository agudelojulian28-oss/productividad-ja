import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { createClient } from '@/adapters/supabase/server';
import { rpID, origin, readChallenge, clearChallengeCookie, CHALLENGE_COOKIE } from '@/lib/webauthn';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('no autorizado', { status: 401 });

  const jar = await cookies();
  const expectedChallenge = readChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  jar.set(clearChallengeCookie.name, clearChallengeCookie.value, clearChallengeCookie.options);
  if (!expectedChallenge) return new NextResponse('reto expirado', { status: 400 });

  const body = (await req.json()) as { response: RegistrationResponseJSON; label?: string };
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'verificación falló', { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return new NextResponse('no verificado', { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  const { error } = await supabase.from('webauthn_credentials').insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_label: body.label ?? null,
  });
  if (error) return new NextResponse(error.message, { status: 400 });

  return NextResponse.json({ ok: true });
}
