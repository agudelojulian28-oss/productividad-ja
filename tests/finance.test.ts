import { describe, it, expect } from 'vitest';
import { registrarMovimiento } from '@/core/finance/transactions';
import { createIncomeSource, archiveIncomeSource } from '@/core/finance/income-sources';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { ctx } from './fake-repo';

const AREA = '00000000-0000-4000-8000-0000000000aa';
const OTRA_AREA = '00000000-0000-4000-8000-0000000000bb';
const PROJ = '00000000-0000-4000-8000-0000000000cc';

async function unaFuente(repo: ReturnType<typeof makeFakeFinanceRepo>, areaId = AREA) {
  const r = await createIncomeSource(ctx(), repo, {
    areaId,
    name: 'Consultoría',
    model: 'servicio',
  });
  if (!r.ok) throw new Error('setup fuente');
  return r.value;
}

describe('registrarMovimiento — COP', () => {
  it('gasto en COP: fx=1, base = amount', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'out',
      amountMinor: 5_000_000, // 50.000 COP
      currency: 'COP',
      areaId: AREA,
      projectId: PROJ,
      category: 'almuerzo',
      occurredOn: '2026-07-29',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fxRate).toBe(1);
      expect(r.value.baseAmountMinor).toBe(5_000_000);
      expect(r.value.amountMinor).toBe(5_000_000);
    }
  });

  it('ingreso en COP con fuente del área', async () => {
    const repo = makeFakeFinanceRepo();
    const src = await unaFuente(repo);
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'in',
      amountMinor: 200_000_000,
      currency: 'COP',
      areaId: AREA,
      projectId: PROJ,
      incomeSourceId: src.id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseAmountMinor).toBe(200_000_000);
  });
});

describe('registrarMovimiento — USD (fx congelado)', () => {
  it('base = round(amount × fxRate)', async () => {
    const repo = makeFakeFinanceRepo();
    const src = await unaFuente(repo);
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'in',
      amountMinor: 10_000, // 100.00 USD
      currency: 'USD',
      fxRate: 4000, // 4.000 COP por USD
      areaId: AREA,
      projectId: PROJ,
      incomeSourceId: src.id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fxRate).toBe(4000);
      expect(r.value.baseAmountMinor).toBe(40_000_000); // 400.000 COP
      expect(r.value.currency).toBe('USD');
    }
  });

  it('redondea la conversión con tasa fraccionaria', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'out',
      amountMinor: 1_250, // 12.50 USD
      currency: 'USD',
      fxRate: 4123.5,
      areaId: AREA,
      projectId: PROJ,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseAmountMinor).toBe(Math.round(1_250 * 4123.5));
  });

  it('USD sin tasa → INVALID_INPUT', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'out',
      amountMinor: 1_000,
      currency: 'USD',
      areaId: AREA,
      projectId: PROJ,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });
});

describe('reglas', () => {
  it('movimiento sin proyecto → INVALID_INPUT (schema)', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'in',
      amountMinor: 1_000,
      currency: 'COP',
      areaId: AREA,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('fuente de otra área → RULE_VIOLATION', async () => {
    const repo = makeFakeFinanceRepo();
    const src = await unaFuente(repo, OTRA_AREA);
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'in',
      amountMinor: 1_000,
      currency: 'COP',
      areaId: AREA,
      projectId: PROJ,
      incomeSourceId: src.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });

  it('monto no positivo → INVALID_INPUT', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'out',
      amountMinor: 0,
      currency: 'COP',
      areaId: AREA,
      projectId: PROJ,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('sin occurredOn usa hoy en la zona del usuario', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await registrarMovimiento(ctx(), repo, {
      direction: 'out',
      amountMinor: 1_000,
      currency: 'COP',
      areaId: AREA,
      projectId: PROJ,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.occurredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('fuentes de ingreso', () => {
  it('crea y archiva', async () => {
    const repo = makeFakeFinanceRepo();
    const src = await unaFuente(repo);
    const r = await archiveIncomeSource(ctx(), repo, src.id);
    expect(r.ok).toBe(true);
    const list = await repo.listIncomeSources();
    expect(list.length).toBe(0);
  });

  it('archivar inexistente → NOT_FOUND', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await archiveIncomeSource(ctx(), repo, '00000000-0000-4000-8000-000000000999');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });
});
