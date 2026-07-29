import type { ActorContext } from '@/core/types';
import { createUserClient } from '@/adapters/supabase/as-user';
import { buildSummary, type SummaryKind } from '@/lib/summary';
import { sendText } from '@/adapters/whatsapp/client';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

function secretOk(header: string | null): boolean {
  const expected = process.env.WORKER_SECRET ?? '';
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Resumen diario/semanal: lo dispara pg_cron vía pg_net (ADR-015). Construye el
 *  resumen bajo RLS (JWT efímero, nunca service_role) y lo envía por WhatsApp. */
export async function POST(req: Request) {
  if (!secretOk(req.headers.get('x-worker-secret'))) {
    return new Response('no autorizado', { status: 401 });
  }
  const userId = process.env.ALLOWED_USER_ID;
  const to = (process.env.WHATSAPP_ALLOWED_NUMBER ?? '').replace(/\D/g, '');
  if (!userId || !to) return new Response('config', { status: 500 });

  let kind: SummaryKind = 'daily';
  try {
    const body = (await req.json()) as { kind?: string };
    if (body?.kind === 'weekly') kind = 'weekly';
  } catch {
    // sin cuerpo → diario
  }

  const db = createUserClient(userId, { channel: 'cron' });
  const { data: prof } = await db
    .from('profiles')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle();
  const tz = (prof as { timezone: string } | null)?.timezone ?? 'America/Bogota';
  const ctx: ActorContext = { userId, actor: 'system', channel: 'cron', tz };

  try {
    const texto = await buildSummary(db, ctx, kind);
    await sendText(to, texto);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('summary:', e);
    return new Response('error', { status: 500 });
  }
}
