// Adaptador de WhatsApp Cloud API (Meta): solo HTTP + verificación de firma.

import crypto from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Verifica la firma HMAC-SHA256 del cuerpo CRUDO contra `X-Hub-Signature-256`.
 *  Trabaja sobre el cuerpo tal cual llegó (nunca sobre JSON re-serializado).
 *  Compara longitud primero: `timingSafeEqual` lanza si difieren (CLAUDE.md). */
export function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface InboundMedia {
  id: string;
  kind: 'image' | 'audio';
  mime?: string;
}

export interface Inbound {
  from: string; // número del remitente (dígitos)
  messageId: string; // id único del mensaje → dedupe en inbox
  text: string; // cuerpo o pie de foto ('' si es medio sin texto)
  media?: InboundMedia;
}

/** Extrae el primer mensaje relevante de un payload de webhook de WhatsApp:
 *  texto, imagen (con pie opcional) o audio/nota de voz. null para lo demás
 *  (actualizaciones de estado, otros tipos). */
export function parseInbound(payload: unknown): Inbound | null {
  const p = payload as {
    entry?: {
      changes?: {
        value?: {
          messages?: {
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
            image?: { id?: string; mime_type?: string; caption?: string };
            audio?: { id?: string; mime_type?: string };
            voice?: { id?: string; mime_type?: string };
          }[];
        };
      }[];
    }[];
  };
  const msg = p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return null;
  const base = { from: String(msg.from ?? ''), messageId: String(msg.id ?? '') };

  if (msg.type === 'text') return { ...base, text: String(msg.text?.body ?? '') };
  if (msg.type === 'image' && msg.image?.id) {
    return {
      ...base,
      text: String(msg.image.caption ?? ''),
      media: { id: msg.image.id, kind: 'image', mime: msg.image.mime_type },
    };
  }
  const au = msg.audio ?? msg.voice;
  if ((msg.type === 'audio' || msg.type === 'voice') && au?.id) {
    return { ...base, text: '', media: { id: au.id, kind: 'audio', mime: au.mime_type } };
  }
  return null;
}

/** Descarga un medio de WhatsApp (2 pasos: id → URL temporal → binario) y lo
 *  devuelve en base64 con su mime. Requiere WHATSAPP_TOKEN. */
export async function downloadMedia(mediaId: string): Promise<{ data: string; mime: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error('Falta WHATSAPP_TOKEN');
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error('downloadMedia meta: ' + (await metaRes.text()));
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error('downloadMedia: sin url');
  const binRes = await fetch(meta.url, { headers: { authorization: `Bearer ${token}` } });
  if (!binRes.ok) throw new Error('downloadMedia bin: ' + binRes.status);
  const buf = Buffer.from(await binRes.arrayBuffer());
  return { data: buf.toString('base64'), mime: meta.mime_type ?? 'application/octet-stream' };
}

/** Envía un mensaje de texto por WhatsApp Cloud API al número indicado. */
export async function sendText(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error('Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID');
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) throw new Error('sendText: ' + (await res.text()));
}
