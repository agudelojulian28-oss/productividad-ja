import { describe, it, expect } from 'vitest';
import { createMoneyGoal, listMoneyGoals, updateMoneyGoal, deleteMoneyGoal } from '@/core/finance/goals';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { ctx } from './fake-repo';

const AREA = '00000000-0000-4000-8000-0000000000aa';
const OTRA = '00000000-0000-4000-8000-0000000000bb';
const PROJ = '00000000-0000-4000-8000-0000000000cc';

describe('createMoneyGoal', () => {
  it('crea una meta de ingresos acotada a un proyecto', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'Ingresos de julio',
      metric: 'money_in',
      targetValue: 20_000_000,
      projectId: PROJ,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(true);
    const list = await listMoneyGoals(ctx(), repo);
    expect(list.ok && list.value.length).toBe(1);
  });

  it('permite meta general (sin proyecto): cuenta todo', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'Ingresos totales del año',
      metric: 'money_net',
      targetValue: 100,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(true);
    const list = await listMoneyGoals(ctx(), repo);
    expect(list.ok && list.value[0]!.projectId).toBeNull();
  });

  it('rechaza periodo invertido (INVALID_INPUT)', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'x',
      metric: 'money_in',
      targetValue: 100,
      projectId: PROJ,
      periodStart: '2026-07-31',
      periodEnd: '2026-07-01',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('fuente inexistente (legado) → NOT_FOUND', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'x',
      metric: 'money_in',
      targetValue: 100,
      projectId: PROJ,
      incomeSourceId: '00000000-0000-4000-8000-000000000999',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('fuente (legado) de otra área que la indicada → RULE_VIOLATION', async () => {
    const repo = makeFakeFinanceRepo();
    const src = await repo.insertIncomeSource({ areaId: OTRA, name: 'C', model: 'servicio' });
    const r = await createMoneyGoal(ctx(), repo, {
      title: 'x',
      metric: 'money_in',
      targetValue: 100,
      projectId: PROJ,
      areaId: AREA,
      incomeSourceId: src.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });
});

describe('updateMoneyGoal / deleteMoneyGoal', () => {
  async function unaMeta() {
    const repo = makeFakeFinanceRepo();
    const c = await createMoneyGoal(ctx(), repo, {
      title: 'Ingresos de julio',
      metric: 'money_in',
      targetValue: 20_000_000,
      projectId: PROJ,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    const id = c.ok ? (c.value as { id: string }).id : '';
    return { repo, id };
  }

  it('edita título, objetivo y métrica', async () => {
    const { repo, id } = await unaMeta();
    const r = await updateMoneyGoal(ctx(), repo, { id, title: 'Meta agosto', targetValue: 30_000_000, metric: 'money_net' });
    expect(r.ok).toBe(true);
    const list = await listMoneyGoals(ctx(), repo);
    const m = list.ok ? list.value[0]! : null;
    expect(m!.title).toBe('Meta agosto');
    expect(m!.targetValue).toBe(30_000_000);
    expect(m!.metric).toBe('money_net');
  });

  it('rechaza periodo invertido (RULE_VIOLATION)', async () => {
    const { repo, id } = await unaMeta();
    const r = await updateMoneyGoal(ctx(), repo, { id, periodStart: '2026-08-31', periodEnd: '2026-08-01' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });

  it('meta inexistente → NOT_FOUND', async () => {
    const { repo } = await unaMeta();
    const r = await updateMoneyGoal(ctx(), repo, { id: OTRA, title: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('borra la meta', async () => {
    const { repo, id } = await unaMeta();
    const d = await deleteMoneyGoal(ctx(), repo, id);
    expect(d.ok).toBe(true);
    const list = await listMoneyGoals(ctx(), repo);
    expect(list.ok && list.value.length).toBe(0);
  });
});
