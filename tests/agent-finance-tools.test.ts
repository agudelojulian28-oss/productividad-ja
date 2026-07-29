import { describe, it, expect } from 'vitest';
import { runTool, type ToolDeps } from '@/agent/tools';
import { makeFakeRepo, ctx } from './fake-repo';
import { makeFakeFinanceRepo } from './fake-finance-repo';

const AREA = '00000000-0000-4000-8000-0000000000aa';

function deps(): ToolDeps & { fin: ReturnType<typeof makeFakeFinanceRepo> } {
  const fin = makeFakeFinanceRepo();
  return { ctx: ctx(), repo: makeFakeRepo(), finance: fin, fin };
}

describe('runTool · registrar_movimiento', () => {
  it('registra un gasto en COP', async () => {
    const d = deps();
    const r = await runTool(d, 'registrar_movimiento', {
      tipo: 'gasto',
      monto: 50000,
      moneda: 'COP',
      area_id: AREA,
      categoria: 'almuerzo',
    });
    expect(r.ok).toBe(true);
    expect(d.fin._txs.length).toBe(1);
    expect(d.fin._txs[0]!.baseAmountMinor).toBe(5_000_000);
  });

  it('convierte el monto de moneda a centavos (12.5 USD → base con tasa)', async () => {
    const d = deps();
    const src = await d.fin.insertIncomeSource({ areaId: AREA, name: 'C', model: 'servicio' });
    const r = await runTool(d, 'registrar_movimiento', {
      tipo: 'ingreso',
      monto: 12.5,
      moneda: 'USD',
      area_id: AREA,
      fuente_id: src.id,
      tasa: 4000,
    });
    expect(r.ok).toBe(true);
    const tx = d.fin._txs[0]!;
    expect(tx.amountMinor).toBe(1_250);
    expect(tx.baseAmountMinor).toBe(5_000_000); // 1250 × 4000
  });

  it('ingreso sin fuente → error (no escribe)', async () => {
    const d = deps();
    const r = await runTool(d, 'registrar_movimiento', {
      tipo: 'ingreso',
      monto: 1000,
      moneda: 'COP',
      area_id: AREA,
    });
    expect(r.ok).toBe(false);
    expect(d.fin._txs.length).toBe(0);
  });
});

describe('runTool · consultar dinero', () => {
  it('resumen_financiero suma lo registrado este mes', async () => {
    const d = deps();
    await runTool(d, 'registrar_movimiento', {
      tipo: 'gasto',
      monto: 30000,
      moneda: 'COP',
      area_id: AREA,
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
