import type Anthropic from '@anthropic-ai/sdk';
import type { ActorContext } from '@/core/types';
import type { ServerSupabase } from '@/adapters/supabase/server';
import { createUserClient } from '@/adapters/supabase/as-user';
import { buildAgentDeps, runAgentToText } from '@/lib/agent-run';
import { getConversation, loadMessages, saveMessage } from '@/lib/chat';
import { sendText, downloadMedia } from '@/adapters/whatsapp/client';
import { transcribeAudio, transcripcionDisponible } from '@/lib/transcribe';
import type { InputImage } from '@/agent/loop';
import crypto from 'node:crypto';

const IMG_TYPES: InputImage['mediaType'][] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 5;

interface InboxRow {
  id: number;
  external_id: string;
  attempts: number;
  payload: {
    from?: string;
    text?: string;
    media?: { id: string; kind: 'image' | 'audio'; mime?: string } | null;
  };
}

function secretOk(header: string | null): boolean {
  const expected = process.env.WORKER_SECRET ?? '';
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get('x-worker-secret'))) {
    return new Response('no autorizado', { status: 401 });
  }
  const userId = process.env.ALLOWED_USER_ID;
  if (!userId) return new Response('config', { status: 500 });

  // Cliente RLS del usuario único vía JWT efímero (ADR-017). Nunca service_role aquí.
  const db = createUserClient(userId, { channel: 'whatsapp' });

  // Reclamo: leer pendientes y transicionarlas con guarda optimista. El lock de fila de
  // Postgres serializa updates concurrentes → `eq('status','pending')` evita doble proceso.
  const { data: pend } = await db
    .from('inbox')
    .select('id')
    .eq('status', 'pending')
    .order('received_at', { ascending: true })
    .limit(BATCH);
  const ids = ((pend as { id: number }[] | null) ?? []).map((r) => r.id);
  if (ids.length === 0) return new Response('vacío', { status: 200 });

  const { data: claimed } = await db
    .from('inbox')
    .update({ status: 'processing', claimed_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'pending')
    .select('id, external_id, attempts, payload');
  const rows = (claimed as InboxRow[] | null) ?? [];

  let done = 0;
  for (const row of rows) {
    try {
      await handle(db, userId, row);
      await db.from('inbox').update({ status: 'done' }).eq('id', row.id);
      done++;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'error';
      await db
        .from('inbox')
        .update({ status: 'failed', last_error: message, attempts: (row.attempts ?? 0) + 1 })
        .eq('id', row.id);
    }
  }
  return new Response(`ok ${done}/${rows.length}`, { status: 200 });
}

async function handle(db: ServerSupabase, userId: string, row: InboxRow): Promise<void> {
  const from = String(row.payload?.from ?? '');
  let text = String(row.payload?.text ?? '');
  const media = row.payload?.media ?? null;
  if (!from) return;

  // Audio: se transcribe con Whisper si hay proveedor (GROQ_API_KEY); si no, cortesía.
  if (media?.kind === 'audio') {
    if (!transcripcionDisponible()) {
      await sendText(from, 'Por ahora no puedo procesar audios 🙏 Escríbeme el mensaje o mándame una foto.');
      return;
    }
    try {
      const { data, mime } = await downloadMedia(media.id);
      text = await transcribeAudio(Buffer.from(data, 'base64'), mime);
    } catch (e) {
      console.error('transcripción:', e);
      await sendText(from, 'No pude entender el audio 😕 ¿me lo reenvías o me lo escribes?');
      return;
    }
    if (!text.trim()) {
      await sendText(from, 'No alcancé a escuchar nada en el audio 🙏');
      return;
    }
  }

  // Imagen: la descargamos de Meta y se la pasamos a Claude (visión).
  const images: InputImage[] = [];
  if (media?.kind === 'image') {
    try {
      const { data, mime } = await downloadMedia(media.id);
      const mediaType = (IMG_TYPES as string[]).includes(mime)
        ? (mime as InputImage['mediaType'])
        : 'image/jpeg';
      images.push({ mediaType, data });
    } catch (e) {
      console.error('descarga de imagen:', e);
      await sendText(from, 'No pude descargar la imagen 😕 ¿me la reenvías?');
      return;
    }
  }

  const userText = text.trim() || (images.length > 0 ? 'Mira esta imagen.' : '');
  if (!userText && images.length === 0) return;

  const { data: prof } = await db
    .from('profiles')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle();
  const tz = (prof as { timezone: string } | null)?.timezone ?? 'America/Bogota';
  const ctx: ActorContext = { userId, actor: 'agent', channel: 'whatsapp', tz };

  const conversationId = await getConversation(db, userId, 'whatsapp');
  const prior = await loadMessages(db, conversationId);
  const history: Anthropic.MessageParam[] = prior.map((m) => ({ role: m.role, content: m.text }));

  // El historial es de texto; la imagen va solo en este turno.
  await saveMessage(db, conversationId, userId, 'user', text.trim() || '📷 (imagen)');
  const reply = await runAgentToText(buildAgentDeps(db, ctx), history, userText, images);
  await saveMessage(db, conversationId, userId, 'assistant', reply);
  await sendText(from, reply);
}
