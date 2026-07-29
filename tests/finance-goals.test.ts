import { describe, it, expect } from 'vitest';
import { createMoneyGoal, listMoneyGoals } from '@/core/finance/goals';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { ctx } from './fake-repo';

const AREA = '00000000-0000-4000-8000-0000000000aa';
const OTRA = '00000000-0000-4000-8000-0000000000bb';

describe('createMoneyGoal', () => {
  it('crea una meta de ingresos acotada a un área', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'Ingresos de julio',
      metric: 'money_in',
      targetValue: 20_000_000,
      areaId: AREA,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(true);
    const list = await listMoneyGoals(ctx(), repo);
    expect(list.ok && list.value.length).toBe(1);
  });

  it('exige área o fuente (INVALID_INPUT)', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'x',
      metric: 'money_net',
      targetValue: 100,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('rechaza periodo invertido (INVALID_INPUT)', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'x',
      metric: 'money_in',
      targetValue: 100,
      areaId: AREA,
      periodStart: '2026-07-31',
      periodEnd: '2026-07-01',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('fuente inexistente → NOT_FOUND', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'x',
      metric: 'money_in',
      targetValue: 100,
      incomeSourceId: '00000000-0000-4000-8000-000000000999',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('fuente de otra área que la indicada → RULE_VIOLATION', async () => {
    const repo = makeFakeFinanceRepo();
    const src = await repo.insertIncomeSource({ areaId: OTRA, name: 'C', model: 'servicio' });
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'x',
      metric: 'money_in',
      targetValue: 100,
      areaId: AREA,
      incomeSourceId: src.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });
});
