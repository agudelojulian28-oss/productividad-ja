import type Anthropic from '@anthropic-ai/sdk';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { anthropicClient } from '@/adapters/anthropic/client';
import { runAgent, type AgentDeps } from '@/agent/loop';
import { getWebConversation, loadMessages, saveMessage } from '@/lib/chat';
import { syncTaskToCalendar, removeTaskEvent as removeCalendarEvent } from '@/lib/calendar-sync';

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

  const repo = workRepo(supabase, ctx.userId);
  const deps: AgentDeps = {
    client: anthropicClient(),
    ctx,
    repo,
    syncTask: (task) => syncTaskToCalendar(supabase, ctx, repo, task),
    removeTaskEvent: (task) =>
      task.googleEventId ? removeCalendarEvent(supabase, ctx, task.googleEventId) : Promise.resolve(),
    async getCachedResult(id) {
      const { data } = await supabase
        .from('tool_executions')
        .select('result')
        .eq('tool_call_id', id)
        .maybeSingle();
      return data ? (data as { result: unknown }).result : undefined;
    },
    async saveResult(id, action, result) {
      await supabase
        .from('tool_executions')
        .insert({ tool_call_id: id, user_id: ctx.userId, action, result });
    },
    async consumeBudget(usd) {
      const { data, error } = await supabase.rpc('check_and_consume_budget', {
        p_user: ctx.userId,
        p_usd: usd,
      });
      return error ? true : data === true;
    },
  };

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
