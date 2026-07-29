import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { createUserClient } from '@/adapters/supabase/as-user';
import { adminClient } from '@/adapters/supabase/admin';
import { rpID, origin, readChallenge, clearChallengeCookie, CHALLENGE_COOKIE } from '@/lib/webauthn';

export const runtime = 'nodejs';

interface CredRow {
  credential_id: string;
  public_key: string;
  counter: number | string;
  transports: string[];
}

/** Pública: verifica la aserción WebAuthn y, SOLO si pasa, mintea una sesión real
 *  de Supabase vía admin.generateLink (sin enviar correo) → el cliente hace verifyOtp.
 *  Único uso de service_role fuera de channels (ADR-023). */
export async function POST(req: Request) {
  const userId = process.env.ALLOWED_USER_ID;
  if (!userId) return new NextResponse('config', { status: 500 });

  const jar = await cookies();
  const expectedChallenge = readChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  jar.set(clearChallengeCookie.name, clearChallengeCookie.value, clearChallengeCookie.options);
  if (!expectedChallenge) return new NextResponse('reto expirado', { status: 400 });

  const body = (await req.json()) as AuthenticationResponseJSON;

  const db = createUserClient(userId, { channel: 'web' });
  const { data: cred } = await db
    .from('webauthn_credentials')
    .select('credential_id,public_key,counter,transports')
    .eq('credential_id', body.id)
    .maybeSingle();
  if (!cred) return new NextResponse('credencial desconocida', { status: 400 });
  const c = cred as CredRow;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: c.credential_id,
        publicKey: isoBase64URL.toBuffer(c.public_key),
        counter: Number(c.counter),
        transports: c.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'verificación falló', { status: 400 });
  }
  if (!verification.verified) return new NextResponse('no verificado', { status: 400 });

  await db
    .from('webauthn_credentials')
    .update({ counter: verification.authenticationInfo.newCounter })
    .eq('credential_id', c.credential_id);

  // Mintear sesión real sin correo (ADR-023).
  const admin = adminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const email = u.user?.email;
  if (!email) return new NextResponse('sin email', { status: 500 });

  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link) return new NextResponse('no se pudo iniciar sesión', { status: 500 });

  return NextResponse.json({ token_hash: link.properties.hashed_token });
}
