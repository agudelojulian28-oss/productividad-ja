import type Anthropic from '@anthropic-ai/sdk';
import type { ServerSupabase } from '@/adapters/supabase/server';
import type { ActorContext } from '@/core/types';
import { workRepo } from '@/adapters/supabase/work-repo';
import { anthropicClient } from '@/adapters/anthropic/client';
import { runAgent, type AgentDeps } from '@/agent/loop';
import {
  syncTaskToCalendar,
  removeTaskEvent as removeCalendarEvent,
  getDayEvents,
  patchCalendarEvent,
} from '@/lib/calendar-sync';

/** Arma las dependencias del agente para un cliente Supabase (RLS) y un contexto.
 *  Mismo cableado para el chat web y para el worker de canales — un solo camino. */
export function buildAgentDeps(supabase: ServerSupabase, ctx: ActorContext): AgentDeps {
  const repo = workRepo(supabase, ctx.userId);
  return {
    client: anthropicClient(),
    ctx,
    repo,
    syncTask: (task) => syncTaskToCalendar(supabase, ctx, repo, task),
    removeTaskEvent: (task) =>
      task.googleEventId
        ? removeCalendarEvent(supabase, ctx, task.googleEventId)
        : Promise.resolve(),
    listCalendar: (dateYmd) => getDayEvents(supabase, ctx, dateYmd),
    editEvent: (eventId, patch) => patchCalendarEvent(supabase, ctx, eventId, patch),
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
}

/** Corre el agente y devuelve solo el texto final (sin streaming). Para canales
 *  como WhatsApp, donde se responde con un único mensaje. */
export async function runAgentToText(
  deps: AgentDeps,
  history: Anthropic.MessageParam[],
  message: string,
): Promise<string> {
  let text = '';
  for await (const ev of runAgent(deps, history, message)) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'error') text += (text ? '\n\n' : '') + `⚠️ ${ev.message}`;
  }
  return text.trim() || 'Listo.';
}
