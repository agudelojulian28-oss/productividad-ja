import { requireContext } from '@/lib/auth';
import { transcribeAudio, transcripcionDisponible } from '@/lib/transcribe';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Transcribe una nota de voz del chat web a texto (Groq Whisper). Requiere sesión.
 *  Si no hay GROQ_API_KEY, responde 503 con aviso para que la UI lo muestre. */
export async function POST(req: Request) {
  await requireContext();

  if (!transcripcionDisponible()) {
    return Response.json(
      { error: 'no_provider', message: 'La transcripción de audio no está activada.' },
      { status: 503 },
    );
  }

  const body = (await req.json()) as { data?: string; mime?: string };
  if (!body.data) return new Response('Falta el audio', { status: 400 });

  try {
    const text = await transcribeAudio(Buffer.from(body.data, 'base64'), body.mime ?? 'audio/webm');
    return Response.json({ text });
  } catch {
    return Response.json(
      { error: 'failed', message: 'No pude entender el audio. Inténtalo de nuevo.' },
      { status: 502 },
    );
  }
}
