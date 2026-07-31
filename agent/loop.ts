import type Anthropic from '@anthropic-ai/sdk';
import type { ActorContext } from '@/core/types';
import type { WorkRepo } from '@/core/work/ports';
import type { FinanceRepo } from '@/core/finance/ports';
import type { StructureRepo } from '@/core/structure/ports';
import type { GEvent } from '@/adapters/google/calendar';
import type { Recurrencia } from '@/lib/recurrence';
import { AGENT_MODEL, PRICE } from '@/adapters/anthropic/client';
import { toolDefinitions, isToolName } from './schemas';
import { runTool } from './tools';
import { SYSTEM_PROMPT } from './prompt';

const MAX_ITERATIONS = 8; // corta bucles del modelo (causa de facturas sorpresa)

/** Imagen adjunta al mensaje del usuario (base64). Claude la entiende de forma
 *  nativa (visión). Los formatos que acepta la API son estos cuatro. */
export interface InputImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64 sin el prefijo data:
}

export interface AgentDeps {
  client: Anthropic;
  ctx: ActorContext;
  repo: WorkRepo;
  finance: FinanceRepo;
  structure: StructureRepo;
  /** Efectos de calendario. Las TAREAS no van al calendario (ADR-022): solo EVENTOS. */
  listCalendar?: (dateYmd: string) => Promise<GEvent[]>;
  listRange?: (startYmd: string, endYmd: string) => Promise<GEvent[]>;
  googleConnected?: () => Promise<boolean>;
  createEvent?: (input: {
    titulo: string;
    fecha: string;
    colorId?: string;
    durationMin?: number;
    descripcion?: string;
    projectId?: string;
    goalId?: string;
  }) => Promise<string>;
  editEvent?: (
    eventId: string,
    patch: {
      titulo?: string;
      fecha?: string;
      colorId?: string;
      durationMin?: number;
      recurrencia?: Recurrencia;
      scope?: 'serie' | 'instancia';
    },
  ) => Promise<void>;
  deleteEvent?: (eventId: string, opts?: { scope?: 'serie' | 'instancia' }) => Promise<void>;
  /** Última mutación del usuario (audit_log), para `deshacer`. */
  lastAudit?: () => Promise<import('@/lib/undo').AuditEntry | null>;
  /** Idempotencia: resultado ya ejecutado para este tool_call_id, si existe. */
  getCachedResult: (toolCallId: string) => Promise<unknown | undefined>;
  saveResult: (toolCallId: string, action: string, result: unknown) => Promise<void>;
  /** Circuit breaker: consume USD; devuelve false si se pasó del tope mensual. */
  consumeBudget: (usd: number) => Promise<boolean>;
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

function costUsd(u: Anthropic.Usage): number {
  return (
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
    1_000_000
  );
}

/** Loop del agente. El agente PROPONE herramientas; runTool (→ /core) ejecuta bajo RLS.
 *  Emite eventos para streamear al chat. Devuelve el historial actualizado. */
export async function* runAgent(
  deps: AgentDeps,
  history: Anthropic.MessageParam[],
  userMessage: string,
  images: InputImage[] = [],
): AsyncGenerator<AgentEvent, void, unknown> {
  const now = new Date();
  const nowLine =
    `Ahora: ${now.toLocaleString('es-CO', { timeZone: deps.ctx.tz })} ` +
    `(zona ${deps.ctx.tz}). Hora ISO: ${now.toISOString()}`;

  const text = `${nowLine}\n\n${userMessage}`;
  // Con imágenes, el contenido va como bloques (texto + imágenes). Sin imágenes,
  // se mantiene como string para no alterar el layout de caché.
  const userContent: Anthropic.MessageParam['content'] =
    images.length > 0
      ? [
          { type: 'text', text },
          ...images.map(
            (img): Anthropic.ImageBlockParam => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType, data: img.data },
            }),
          ),
        ]
      : text;

  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userContent }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = deps.client.messages.stream({
      model: AGENT_MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: toolDefinitions as Anthropic.Tool[],
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();

    if (!(await deps.consumeBudget(costUsd(final.usage)))) {
      yield { type: 'error', message: 'Se alcanzó el tope de gasto mensual del agente.' };
      return;
    }

    messages.push({ role: 'assistant', content: final.content });

    if (final.stop_reason !== 'tool_use') {
      yield { type: 'done' };
      return;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      if (!isToolName(block.name)) {
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Herramienta desconocida',
          is_error: true,
        });
        continue;
      }
      yield { type: 'tool', name: block.name };

      let result = await deps.getCachedResult(block.id);
      if (result === undefined) {
        result = await runTool(
          {
            ctx: deps.ctx,
            repo: deps.repo,
            finance: deps.finance,
            structure: deps.structure,
            listCalendar: deps.listCalendar,
            listRange: deps.listRange,
            googleConnected: deps.googleConnected,
            createEvent: deps.createEvent,
            editEvent: deps.editEvent,
            deleteEvent: deps.deleteEvent,
            lastAudit: deps.lastAudit,
          },
          block.name,
          block.input,
        );
        await deps.saveResult(block.id, block.name, result);
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }

    messages.push({ role: 'user', content: results });
  }

  yield { type: 'done' };
}
