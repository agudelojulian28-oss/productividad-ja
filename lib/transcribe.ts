// Transcripción de audio (Claude no procesa audio). Usa Groq Whisper por su
// endpoint compatible con OpenAI: barato y rápido. Requiere GROQ_API_KEY.
// Si la llave no está, transcripciónDisponible() devuelve false y el llamador
// responde con cortesía en vez de fallar.

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';

export function transcripcionDisponible(): boolean {
  return !!process.env.GROQ_API_KEY;
}

/** Transcribe un audio (buffer + mime) a texto en español. Lanza si falla. */
export async function transcribeAudio(audio: Buffer, mime: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('Falta GROQ_API_KEY');

  const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('mpeg') ? 'mp3' : 'ogg';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `nota.${ext}`);
  form.append('model', MODEL);
  form.append('language', 'es');
  form.append('response_format', 'text');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error('transcribeAudio: ' + (await res.text()));
  return (await res.text()).trim();
}
