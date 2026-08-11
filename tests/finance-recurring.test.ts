import { describe, it, expect } from 'vitest';
import {
  nextDue,
  createRecurringExpense,
  confirmRecurringExpense,
  skipRecurringExpense,
} from '@/core/finance/recurring';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { ctx } from './fake-repo';

const PROJ = '00000000-0000-4000-8000-0000000000cc';
const AREA = '00000000-0000-4000-8000-0000000000aa';

describe('nextDue', () => {
  it('semanal suma 7 días', () => {
    expect(nextDue('semanal', '2026-08-05')).toBe('2026-08-12');
  });
  it('mensual conserva el día y no desborda (31 ene → 28 feb)', () => {
    expect(nextDue('mensual', '2026-01-31')).toBe('2026-02-28');
    expect(nextDue('mensual', '2026-08-05')).toBe('2026-09-05');
  });
  it('anual suma un año', () => {
    expect(nextDue('anual', '2026-08-05')).toBe('2027-08-05');
  });
});

async function crear(repo: ReturnType<typeof makeFakeFinanceRepo>, nextDueOn = '2026-08-05') {
  const r = await createRecurringExpense(ctx(), repo, {
    projectId: PROJ,
    areaId: AREA,
    amountMinor: 500000,
    description: 'Arriendo',
    frequency: 'mensual',
    nextDueOn,
  });
  if (!r.ok) throw new Error('no creó');
  return r.value;
}

describe('confirmRecurringExpense', () => {
  it('crea la transacción (gasto) y avanza la fecha', async () => {
    const repo = makeFakeFinanceRepo();
    const rec = await crear(repo);
    const r = await confirmRecurringExpense(ctx(), repo, { id: rec.id });
    expect(r.ok).toBe(true);
    expect(repo._txs.length).toBe(1);
    expect(repo._txs[0]!.direction).toBe('out');
    expect(repo._txs[0]!.baseAmountMinor).toBe(500000);
    expect(repo._txs[0]!.projectId).toBe(PROJ);
    // avanzó un mes
    expect(repo._recurring.get(rec.id)!.nextDueOn).toBe('2026-09-05');
  });

  it('usa el monto editado si se pasa', async () => {
    const repo = makeFakeFinanceRepo();
    const rec = await crear(repo);
    await confirmRecurringExpense(ctx(), repo, { id: rec.id, amountMinor: 620000 });
    expect(repo._txs[0]!.baseAmountMinor).toBe(620000);
  });
});

describe('skipRecurringExpense', () => {
  it('avanza la fecha sin crear transacción', async () => {
    const repo = makeFakeFinanceRepo();
    const rec = await crear(repo);
    const r = await skipRecurringExpense(ctx(), repo, rec.id);
    expect(r.ok).toBe(true);
    expect(repo._txs.length).toBe(0);
    expect(repo._recurring.get(rec.id)!.nextDueOn).toBe('2026-09-05');
  });
});
