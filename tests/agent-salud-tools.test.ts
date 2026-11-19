import { describe, it, expect } from 'vitest';
import { runTool, type ToolDeps } from '@/agent/tools';
import { makeFakeRepo, ctx } from './fake-repo';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { makeFakeStructureRepo } from './fake-structure-repo';
import { makeFakeHealthRepo } from './fake-health-repo';
import { MERCADO_DESC } from '@/lib/salud-mercado';

function deps(): ToolDeps & {
  repo: ReturnType<typeof makeFakeRepo>;
  fin: ReturnType<typeof makeFakeFinanceRepo>;
  st: ReturnType<typeof makeFakeStructureRepo>;
  hl: ReturnType<typeof makeFakeHealthRepo>;
} {
  const repo = makeFakeRepo();
  const fin = makeFakeFinanceRepo();
  const st = makeFakeStructureRepo();
  const hl = makeFakeHealthRepo();
  return { ctx: ctx(), repo, finance: fin, structure: st, health: hl, fin, st, hl };
}

type SaludView = {
  checklist_hoy: { id: string; titulo: string; hecho: boolean }[];
  compromisos: string[];
  semana_entreno: Record<string, string>;
  hora_dorada?: { minutos?: number };
};

describe('runTool · salud (agente)', () => {
  it('consultar salud precarga el plan y devuelve checklist, semana y compromisos', async () => {
    const d = deps();
    const r = await runTool(d, 'consultar', { vista: 'salud' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as SaludView;
    expect(v.checklist_hoy.length).toBeGreaterThan(0);
    expect(v.compromisos).toContain('No trabajar los domingos');
    expect(v.semana_entreno.domingo).toMatch(/^descanso/i);
    expect(v.hora_dorada?.minutos).toBe(30);
  });

  it('actualizar salud accion=completar marca el día (y reabrir lo desmarca)', async () => {
    const d = deps();
    const r = await runTool(d, 'consultar', { vista: 'salud' });
    const item = (r.ok ? (r.value as SaludView).checklist_hoy : [])[0]!;
    const c = await runTool(d, 'actualizar', { tipo: 'salud', id: item.id, accion: 'completar' });
    expect(c.ok).toBe(true);
    expect(d.hl._checkins.some((x) => x.itemId === item.id)).toBe(true);
    await runTool(d, 'actualizar', { tipo: 'salud', id: item.id, accion: 'reabrir' });
    expect(d.hl._checkins.some((x) => x.itemId === item.id)).toBe(false);
  });

  it('crear salud (hábito con días) y un ejercicio dentro de una rutina', async () => {
    const d = deps();
    const h = await runTool(d, 'crear', {
      tipo: 'salud', seccion: 'cuerpo', elemento: 'habito', titulo: 'Tomar 3 L de agua', dias: [1, 2, 3, 4, 5], seguimiento: true,
    });
    expect(h.ok).toBe(true);
    const rut = await runTool(d, 'crear', { tipo: 'salud', seccion: 'entrenamiento', elemento: 'rutina', titulo: 'C · Movilidad' });
    const rid = rut.ok ? (rut.value as { salud_id: string }).salud_id : '';
    const ej = await runTool(d, 'crear', {
      tipo: 'salud', seccion: 'entrenamiento', elemento: 'ejercicio', titulo: 'Gato-camello', padre_id: rid,
    });
    expect(ej.ok).toBe(true);
    const suelto = await runTool(d, 'crear', { tipo: 'salud', seccion: 'entrenamiento', elemento: 'ejercicio', titulo: 'X' });
    expect(suelto.ok).toBe(false);
  });

  it('mercado con precio crea el gasto fijo "Mercado · dieta" (y área/proyecto Salud si no existen)', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'mercado', titulo: 'Huevos', cantidad: '30', monto: 18_000, frecuencia: 'semanal' });
    expect(r.ok).toBe(true);
    expect((await d.st.listAreas()).some((a) => a.name === 'Salud')).toBe(true);
    const recs = [...d.fin._recurring.values()];
    const mercado = recs.find((x) => x.description === MERCADO_DESC)!;
    expect(mercado).toBeTruthy();
    expect(mercado.frequency).toBe('mensual');
    expect(mercado.amountMinor).toBe(Math.round(1_800_000 * (52 / 12))); // 18.000 semanal → mensual

    // Cambiar el precio actualiza el mismo gasto fijo (no crea otro).
    const id = r.ok ? (r.value as { mercado_id: string }).mercado_id : '';
    await runTool(d, 'actualizar', { tipo: 'mercado', id, monto: 20_000 });
    const recs2 = [...d.fin._recurring.values()].filter((x) => x.description === MERCADO_DESC);
    expect(recs2.length).toBe(1);
    expect(recs2[0]!.amountMinor).toBe(Math.round(2_000_000 * (52 / 12)));

    // Sin ítems con precio, el gasto fijo se desactiva (no se borra).
    await runTool(d, 'archivar', { tipo: 'mercado', id });
    expect([...d.fin._recurring.values()].find((x) => x.description === MERCADO_DESC)!.active).toBe(false);
  });
});
