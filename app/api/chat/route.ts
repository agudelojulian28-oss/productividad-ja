import type Anthropic from '@anthropic-ai/sdk';
import { requireContext } from '@/lib/auth';
import { buildAgentDeps } from '@/lib/agent-run';
import { runAgent } from '@/agent/loop';
import { getWebConversation, loadMessages, saveMessage } from '@/lib/chat';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { supabase, ctx } = await requireContext();
  const body = (await req.json()) as { message: string };
  if (!body.message?.trim()) return new Response('Falta el mensaje', { status: 400 });

  const conversationId = await getWebConversation(supabase, ctx.userId);
  const prior = await loadMessages(supabase, conversationId);
  const history: Anthropic.MessageParam[] = prior.map((m) => ({ role: m.role, content: m.text }));

  await saveMessage(supabase, conversationId, ctx.userId, 'user', body.message);

  const deps = buildAgentDeps(supabase, ctx);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = '';
      try {
        for await (const ev of runAgent(deps, history, body.message)) {
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
