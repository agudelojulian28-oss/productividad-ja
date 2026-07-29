// Config y utilidades de WebAuthn (ADR-023). El reto (challenge) viaja en una cookie
// httpOnly firmada con WORKER_SECRET (HMAC), de vida corta; no se guarda en BD.

import crypto from 'node:crypto';

export const rpName = 'Productividad';
export const rpID = process.env.WEBAUTHN_RP_ID ?? 'localhost';
export const origin = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000';

const COOKIE = 'wa_chal';
const TTL_MS = 5 * 60 * 1000;

interface CookieSpec {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: true;
    sameSite: 'lax';
    path: string;
    maxAge: number;
  };
}

function secret(): string {
  const s = process.env.WORKER_SECRET;
  if (!s) throw new Error('Falta WORKER_SECRET');
  return s;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

/** Cookie firmada que guarda el reto WebAuthn por unos minutos. */
export function challengeCookie(challenge: string): CookieSpec {
  const payload = Buffer.from(JSON.stringify({ c: challenge, e: Date.now() + TTL_MS })).toString(
    'base64url',
  );
  return {
    name: COOKIE,
    value: `${payload}.${sign(payload)}`,
    options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TTL_MS / 1000 },
  };
}

export const clearChallengeCookie: CookieSpec = {
  name: COOKIE,
  value: '',
  options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 },
};

export const CHALLENGE_COOKIE = COOKIE;

/** Devuelve el reto guardado si la firma es válida y no expiró; si no, null. */
export function readChallenge(raw: string | undefined): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf('.');
  if (i < 0) return null;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      c?: unknown;
      e?: unknown;
    };
    if (typeof parsed.c !== 'string' || typeof parsed.e !== 'number') return null;
    if (Date.now() > parsed.e) return null;
    return parsed.c;
  } catch {
    return null;
  }
}
