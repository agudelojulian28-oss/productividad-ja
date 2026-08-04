import { describe, it, expect } from 'vitest';
import { runTool, type ToolDeps } from '@/agent/tools';
import { makeFakeRepo, ctx } from './fake-repo';
import type { GEvent } from '@/adapters/google/calendar';

function ev(partial: Partial<GEvent> & { id: string }): GEvent {
  return {
    summary: 'Evento',
    start: null,
    end: null,
    colorId: null,
    allDay: false,
    htmlLink: '',
    description: null,
    projectId: null,
    goalId: null,
    recurringEventId: null,
    recurrence: null,
    ...partial,
  };
}

function calDeps(events: GEvent[], connected = true) {
  const edits: { id: string; fecha?: string }[] = [];
  const deps: ToolDeps = {
    ctx: ctx(),
    repo: makeFakeRepo(),
    googleConnected: async () => connected,
    listCalendar: async () => events,
    editEvent: async (id, patch) => {
      edits.push({ id, fecha: patch.fecha });
    },
  };
  return { deps, edits };
}

describe('mover_agenda', () => {
  it('desplaza todos los eventos del día en UNA sola llamada (ignora los de todo el día)', async () => {
    const events = [
      ev({ id: 'a', start: '2026-08-04T09:00:00-05:00', end: '2026-08-04T10:00:00-05:00' }),
      ev({ id: 'b', start: '2026-08-04T13:00:00-05:00', end: '2026-08-04T14:00:00-05:00' }),
      ev({ id: 'c', start: '2026-08-04', end: null, allDay: true }), // todo el día → se ignora
    ];
    const { deps, edits } = calDeps(events);
    const r = await runTool(deps, 'mover_agenda', { fecha: '2026-08-04', minutos: 60 });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { movidos: number }).movidos).toBe(2);
    expect(edits.length).toBe(2);
    // 09:00-05:00 + 60min = 10:00-05:00
    expect(new Date(edits[0]!.fecha!).getTime()).toBe(
      new Date('2026-08-04T10:00:00-05:00').getTime(),
    );
  });

  it('minutos negativos adelantan los eventos', async () => {
    const events = [ev({ id: 'a', start: '2026-08-04T09:00:00-05:00', end: '2026-08-04T10:00:00-05:00' })];
    const { deps, edits } = calDeps(events);
    const r = await runTool(deps, 'mover_agenda', { fecha: '2026-08-04', minutos: -30 });
    expect(r.ok).toBe(true);
    expect(new Date(edits[0]!.fecha!).getTime()).toBe(
      new Date('2026-08-04T08:30:00-05:00').getTime(),
    );
  });

  it('calendario no conectado → EXTERNAL_ERROR', async () => {
    const { deps } = calDeps([], false);
    const r = await runTool(deps, 'mover_agenda', { fecha: '2026-08-04', minutos: 60 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('EXTERNAL_ERROR');
  });
});
