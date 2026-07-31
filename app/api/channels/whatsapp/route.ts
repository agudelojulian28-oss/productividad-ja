import { verifySignature, parseInbound } from '@/adapters/whatsapp/client';
import { adminClient } from '@/adapters/supabase/admin';

export const runtime = 'nodejs';

// GET: verificación del webhook de Meta (hub.challenge).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const mode = u.searchParams.get('hub.mode');
  const token = u.searchParams.get('hub.verify_token');
  const challenge = u.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// POST: un webhook hace tres cosas y ninguna más (canales.md):
// 1) verifica la firma sobre el cuerpo crudo, 2) INSERT en inbox, 3) devuelve 200.
// Nunca procesa en línea.
export async function POST(req: Request) {
  const raw = await req.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !verifySignature(raw, req.headers.get('x-hub-signature-256'), appSecret)) {
    return new Response('Firma inválida', { status: 401 });
  }

  const inbound = parseInbound(JSON.parse(raw) as unknown);
  // Sin mensaje de texto (actualizaciones de estado, etc.): 200 y listo.
  if (!inbound) return new Response('ok', { status: 200 });

  // Lista blanca: solo el número del usuario único. La medida más barata y efectiva.
  const allowed = (process.env.WHATSAPP_ALLOWED_NUMBER ?? '').replace(/\D/g, '');
  if (allowed && inbound.from.replace(/\D/g, '') !== allowed) {
    return new Response('ok', { status: 200 });
  }

  const userId = process.env.ALLOWED_USER_ID;
  if (!userId) return new Response('config', { status: 500 });

  // Único uso de service_role permitido (ADR-017). 23505 (duplicado) ES la deduplicación.
  const admin = adminClient();
  const { error } = await admin.from('inbox').insert({
    user_id: userId,
    channel: 'whatsapp',
    external_id: inbound.messageId,
    payload: { from: inbound.from, text: inbound.text, media: inbound.media ?? null },
  });
  if (error && error.code !== '23505') {
    // Si el INSERT falla de verdad, 500 para que Meta reintente. Nunca perder el mensaje.
    return new Response('inbox error', { status: 500 });
  }

  // Ruta rápida best-effort: despierta al worker sin esperar. La durabilidad real la
  // garantiza el barrido de pg_cron (ADR-015), pendiente de configurar tras el deploy.
  const base = process.env.WORKER_PUBLIC_URL ?? new URL(req.url).origin;
  void fetch(`${base}/api/worker`, {
    method: 'POST',
    headers: { 'x-worker-secret': process.env.WORKER_SECRET ?? '' },
  }).catch(() => {});

  return new Response('ok', { status: 200 });
}
