// Text-to-speech para el asistente de voz. Usa un proveedor compatible con la API
// de OpenAI (`/audio/speech`), que hace español natural. Barato (~centavos por
// respuesta). Si no hay OPENAI_API_KEY, ttsDisponible() = false y el cliente cae a
// la voz del navegador (SpeechSynthesis) — mismo patrón que lib/transcribe.ts.
//
// Configurable por entorno:
//   OPENAI_API_KEY  — obligatoria para la voz de nube
//   TTS_BASE_URL    — opcional, para proveedores compatibles (default: OpenAI)
//   TTS_MODEL       — opcional (default: gpt-4o-mini-tts)
//   TTS_VOICE       — opcional (default: nova)

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini-tts';
// Voz femenina, cálida y fluida. 'coral'/'shimmer'/'sage' son femeninas en OpenAI.
const DEFAULT_VOICE = 'coral';
// gpt-4o-mini-tts acepta 'instructions' para dirigir tono/idioma/ritmo.
const VOICE_INSTRUCTIONS =
  'Habla en español latino con voz de mujer, cálida, natural y fluida, a ritmo conversacional (ni lento ni robótico). Tono cercano y amable.';
// Tope de caracteres a locutar: las respuestas del agente son cortas; evita costo y
// latencia si alguna vez se alarga.
const MAX_CHARS = 1200;

export function ttsDisponible(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Sintetiza voz (MP3) a partir de texto en español. Lanza si falla. */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY');

  const base = (process.env.TTS_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '');
  const input = text.trim().slice(0, MAX_CHARS);

  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.TTS_MODEL ?? DEFAULT_MODEL,
      voice: process.env.TTS_VOICE ?? DEFAULT_VOICE,
      input,
      instructions: VOICE_INSTRUCTIONS,
      response_format: 'mp3',
      speed: 1.06,
    }),
  });
  if (!res.ok) throw new Error('synthesizeSpeech: ' + (await res.text()));
  return Buffer.from(await res.arrayBuffer());
}
