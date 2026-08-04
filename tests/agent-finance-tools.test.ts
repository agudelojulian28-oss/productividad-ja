import { describe, it, expect } from 'vitest';
import { runTool, type ToolDeps } from '@/agent/tools';
import { makeFakeRepo, ctx } from './fake-repo';
import { makeFakeFinanceRepo } from './fake-finance-repo';

const AREA = '00000000-0000-4000-8000-0000000000aa';

function deps(): ToolDeps & {
  fin: ReturnType<typeof makeFakeFinanceRepo>;
  repo: ReturnType<typeof makeFakeRepo>;
} {
  const fin = makeFakeFinanceRepo();
  const repo = makeFakeRepo();
  return { ctx: ctx(), repo, finance: fin, fin };
}

/** Crea un proyecto en el área y devuelve su id (el dinero se atribuye a proyectos). */
async function unProyecto(d: ReturnType<typeof deps>): Promise<string> {
  const p = await d.repo.insertProject({ title: 'Proyecto X', areaId: AREA });
  return p.id;
}

describe('runTool · crear movimiento', () => {
  it('registra un gasto en COP atribuido a un proyecto', async () => {
    const d = deps();
    const proyecto_id = await unProyecto(d);
    const r = await runTool(d, 'crear', {
      tipo: 'movimiento',
      direccion: 'gasto',
      monto: 50000,
      moneda: 'COP',
      proyecto_id,
      categoria: 'almuerzo',
    });
    expect(r.ok).toBe(true);
    expect(d.fin._txs.length).toBe(1);
    expect(d.fin._txs[0]!.baseAmountMinor).toBe(5_000_000);
    expect(d.fin._txs[0]!.projectId).toBe(proyecto_id);
  });

  it('convierte el monto de moneda a centavos (12.5 USD → base con tasa)', async () => {
    const d = deps();
    const proyecto_id = await unProyecto(d);
    const r = await runTool(d, 'crear', {
      tipo: 'movimiento',
      direccion: 'ingreso',
      monto: 12.5,
      moneda: 'USD',
      proyecto_id,
      tasa: 4000,
    });
    expect(r.ok).toBe(true);
    const tx = d.fin._txs[0]!;
    expect(tx.amountMinor).toBe(1_250);
    expect(tx.baseAmountMinor).toBe(5_000_000); // 1250 × 4000
  });

  it('movimiento sin proyecto → error (no escribe)', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', {
      tipo: 'movimiento',
      direccion: 'ingreso',
      monto: 1000,
      moneda: 'COP',
    });
    expect(r.ok).toBe(false);
    expect(d.fin._txs.length).toBe(0);
  });
});

describe('runTool · consultar dinero', () => {
  it('resumen_financiero suma lo registrado este mes', async () => {
    const d = deps();
    const proyecto_id = await unProyecto(d);
    await runTool(d, 'crear', {
      tipo: 'movimiento',
      direccion: 'gasto',
      monto: 30000,
      moneda: 'COP',
      proyecto_id,
    });
    const r = await runTool(d, 'consultar', { vista: 'resumen_financiero' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { neto: string; gastos: string };
      // money() formatea en COP; 30.000 sale como gasto → neto negativo
      expect(v.gastos).toContain('30.000');
    }
  });

  it('por_cobrar sin ventas devuelve nota (Etapa 5)', async () => {
    const d = deps();
    const r = await runTool(d, 'consultar', { vista: 'por_cobrar' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { nota?: string }).nota).toMatch(/Etapa 5/);
  });
});
