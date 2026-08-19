import { requireContext } from '@/lib/auth';
import { synthesizeSpeech, ttsDisponible } from '@/lib/tts';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Convierte el texto de respuesta del agente en voz (MP3) para el asistente de voz.
 *  Requiere sesión. Si no hay proveedor (OPENAI_API_KEY), responde 503 y el cliente
 *  cae a la voz del navegador. */
export async function POST(req: Request) {
  await requireContext();

  if (!ttsDisponible()) {
    return Response.json(
      { error: 'no_provider', message: 'La voz de nube no está activada.' },
      { status: 503 },
    );
  }

  const body = (await req.json()) as { text?: string };
  const text = (body.text ?? '').trim();
  if (!text) return new Response('Falta el texto', { status: 400 });

  try {
    const mp3 = await synthesizeSpeech(text);
    return new Response(new Uint8Array(mp3), {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'failed', message: 'No pude generar la voz.' },
      { status: 502 },
    );
  }
}
