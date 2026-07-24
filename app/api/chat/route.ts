import type Anthropic from '@anthropic-ai/sdk';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { anthropicClient } from '@/adapters/anthropic/client';
import { runAgent, type AgentDeps } from '@/agent/loop';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body {
  history?: { role: 'user' | 'assistant'; text: string }[];
  message: string;
}

export async function POST(req: Request) {
  const { supabase, ctx } = await requireContext();
  const body = (await req.json()) as Body;
  if (!body.message?.trim()) return new Response('Falta el mensaje', { status: 400 });

  const history: Anthropic.MessageParam[] = (body.history ?? [])
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, content: m.text }));

  const repo = workRepo(supabase, ctx.userId);

  const deps: AgentDeps = {
    client: anthropicClient(),
    ctx,
    repo,
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
      if (error) return true; // no bloquear por un fallo del breaker
      return data === true;
    },
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent(deps, history, body.message)) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
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
