import type Anthropic from '@anthropic-ai/sdk';
import { requireContext } from '@/lib/auth';
import { buildAgentDeps } from '@/lib/agent-run';
import { runAgent, type InputImage } from '@/agent/loop';
import { getWebConversation, loadMessages, saveMessage } from '@/lib/chat';
import { ingestImages, adjuntoNote } from '@/lib/attachments-ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;

const IMG_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(req: Request) {
  const { supabase, ctx } = await requireContext();
  const body = (await req.json()) as {
    message?: string;
    images?: { mediaType?: string; data?: string }[];
    voz?: boolean; // true cuando el turno viene del asistente de voz (Aura)
  };
  const message = (body.message ?? '').trim();
  // Saneo las imágenes: solo formatos que Claude acepta, base64 no vacío, máx. 5.
  const images: InputImage[] = (body.images ?? [])
    .filter((i) => i?.data && IMG_TYPES.includes(i.mediaType ?? ''))
    .slice(0, 5)
    .map((i) => ({ mediaType: i.mediaType as InputImage['mediaType'], data: i.data! }));

  if (!message && images.length === 0) return new Response('Falta el mensaje', { status: 400 });

  const conversationId = await getWebConversation(supabase, ctx.userId);
  // Por voz mandamos menos historial: menos tokens = primer token/respuesta más rápida.
  const prior = await loadMessages(supabase, conversationId, body.voz ? 16 : 60);
  const history: Anthropic.MessageParam[] = prior.map((m) => ({ role: m.role, content: m.text }));

  // Las imágenes no se persisten en el historial (la tabla messages es texto);
  // el agente las ve en este turno. Guardo el texto con una marca si hubo imagen.
  const savedUser = message || (images.length > 0 ? '📷 (imagen)' : '');
  await saveMessage(supabase, conversationId, ctx.userId, 'user', savedUser);

  // Sube las imágenes al bucket para poder guardarlas si el usuario lo pide luego.
  const adjuntoIds = await ingestImages(supabase, ctx, images);
  let userText = (message || 'Mira esta imagen.') + adjuntoNote(adjuntoIds);

  // Pista de VOZ (por turno; no se guarda ni va en el prompt cacheado): prioriza la
  // conversación hablada y ejecutar acciones, no describirlas.
  if (body.voz) {
    userText =
      '[Entrada por VOZ — el usuario te habla y te escuchará.] Responde MUY breve (1-2 frases), ' +
      'natural para oír, sin markdown, listas ni emojis. Si te pide algo que puedas hacer con tus ' +
      'herramientas, EJECÚTALO de una vez y confírmalo en una frase; no te limites a describirlo.\n\n' +
      userText;
  }

  const deps = buildAgentDeps(supabase, ctx);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = '';
      try {
        for await (const ev of runAgent(deps, history, userText, images)) {
          if (ev.type === 'text') assistantText += ev.text;
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
        await saveMessage(supabase, conversationId, ctx.userId, 'assistant', assistantText);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error del agente';
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
