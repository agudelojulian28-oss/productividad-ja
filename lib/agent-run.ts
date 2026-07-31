import type Anthropic from '@anthropic-ai/sdk';
import type { ServerSupabase } from '@/adapters/supabase/server';
import type { ActorContext } from '@/core/types';
import { workRepo } from '@/adapters/supabase/work-repo';
import { getGoogleTokenCipher } from '@/adapters/supabase/integrations';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { anthropicClient } from '@/adapters/anthropic/client';
import { runAgent, type AgentDeps, type InputImage } from '@/agent/loop';
import {
  getDayEvents,
  getRangeEvents,
  createCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
} from '@/lib/calendar-sync';

/** Arma las dependencias del agente para un cliente Supabase (RLS) y un contexto.
 *  Mismo cableado para el chat web y para el worker de canales — un solo camino.
 *  Las TAREAS no se sincronizan al calendario (ADR-022): solo los EVENTOS. */
export function buildAgentDeps(supabase: ServerSupabase, ctx: ActorContext): AgentDeps {
  const repo = workRepo(supabase, ctx.userId);
  return {
    client: anthropicClient(),
    ctx,
    repo,
    finance: financeRepo(supabase, ctx.userId),
    structure: structureRepo(supabase, ctx.userId),
    listCalendar: (dateYmd) => getDayEvents(supabase, ctx, dateYmd),
    listRange: (startYmd, endYmd) => getRangeEvents(supabase, ctx, startYmd, endYmd),
    async googleConnected() {
      return (await getGoogleTokenCipher(supabase, ctx.userId)) !== null;
    },
    createEvent: (input) => createCalendarEvent(supabase, ctx, input),
    editEvent: (eventId, patch) => patchCalendarEvent(supabase, ctx, eventId, patch),
    deleteEvent: (eventId, opts) => deleteCalendarEvent(supabase, ctx, eventId, opts),
    async lastAudit() {
      const { data } = await supabase
        .from('audit_log')
        .select('action,entity_type,entity_id,before,after,occurred_at')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const r = data as {
        action: string;
        entity_type: string;
        entity_id: string | null;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
        occurred_at: string;
      };
      return {
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        before: r.before,
        after: r.after,
        occurredAt: r.occurred_at,
      };
    },
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
  images: InputImage[] = [],
): Promise<string> {
  let text = '';
  for await (const ev of runAgent(deps, history, message, images)) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'error') text += (text ? '\n\n' : '') + `⚠️ ${ev.message}`;
  }
  return text.trim() || 'Listo.';
}
