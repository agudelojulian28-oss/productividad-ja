import { NextResponse } from 'next/server';
import { adminClient } from '@/adapters/supabase/admin';
import { createClient } from '@/adapters/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Puerta de login SOLO para desarrollo local (ADR-025).
 *
 *  Inerte en producción: si NODE_ENV !== 'development' responde 404 antes de tocar
 *  nada. Su razón de ser es poder ver la app autenticada en `npm run dev` sin teclear
 *  la contraseña. Siembra una sesión real del usuario único (ALLOWED_USER_ID) con el
 *  mismo mecanismo que el login por huella: admin.generateLink (sin enviar correo) +
 *  verifyOtp para fijar las cookies. Único uso de service_role fuera de channels/passkey,
 *  y solo en local. */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('not found', { status: 404 });
  }

  const admin = adminClient();

  // Sistema de un solo usuario: usa ALLOWED_USER_ID si está, y si no (típico en local,
  // donde la variable suele ir vacía) cae al único usuario existente.
  let email: string | undefined;
  const userId = process.env.ALLOWED_USER_ID;
  if (userId) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    email = u.user?.email ?? undefined;
  } else {
    // Ignora usuarios de prueba (@example.com) y toma la cuenta real.
    const { data: list } = await admin.auth.admin.listUsers();
    const real = list.users.find((u) => u.email && !u.email.endsWith('@example.com'));
    email = (real ?? list.users[0])?.email ?? undefined;
  }
  if (!email) return new NextResponse('no hay usuario para iniciar sesión', { status: 500 });

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error || !link) return new NextResponse('no se pudo generar la sesión', { status: 500 });

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) return new NextResponse(verifyError.message, { status: 500 });

  return NextResponse.redirect(new URL('/hoy', 'http://localhost:3000'));
}
