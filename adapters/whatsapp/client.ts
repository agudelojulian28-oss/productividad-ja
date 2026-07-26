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

export interface Inbound {
  from: string; // número del remitente (dígitos)
  messageId: string; // id único del mensaje → dedupe en inbox
  text: string;
}

/** Extrae el primer mensaje de texto de un payload de webhook de WhatsApp.
 *  Devuelve null si no hay texto (actualizaciones de estado, otros tipos). */
export function parseInbound(payload: unknown): Inbound | null {
  const p = payload as {
    entry?: {
      changes?: {
        value?: {
          messages?: { from?: string; id?: string; type?: string; text?: { body?: string } }[];
        };
      }[];
    }[];
  };
  const msg = p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== 'text') return null;
  return {
    from: String(msg.from ?? ''),
    messageId: String(msg.id ?? ''),
    text: String(msg.text?.body ?? ''),
  };
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
