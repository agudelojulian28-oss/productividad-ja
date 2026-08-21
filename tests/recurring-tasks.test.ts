import { describe, it, expect } from 'vitest';
import {
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
  generateDueRecurringTasks,
  nextDue,
} from '@/core/work/recurring-tasks';
import { makeFakeRepo, ctx } from './fake-repo';

describe('nextDue', () => {
  it('avanza según la frecuencia', () => {
    expect(nextDue('semanal', '2026-08-10')).toBe('2026-08-17');
    expect(nextDue('quincenal', '2026-08-10')).toBe('2026-08-25');
    expect(nextDue('mensual', '2026-08-10')).toBe('2026-09-10');
    expect(nextDue('anual', '2026-08-10')).toBe('2027-08-10');
  });
  it('mensual no desborda (31 ene → 28/29 feb)', () => {
    expect(nextDue('mensual', '2026-01-31')).toBe('2026-02-28');
  });
});

describe('createRecurringTask', () => {
  it('crea con los campos dados', async () => {
    const repo = makeFakeRepo();
    const r = await createRecurringTask(ctx(), repo, {
      title: 'Revisar TV',
      frequency: 'semanal',
      nextDueOn: '2026-08-24',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe('Revisar TV');
      expect(r.value.frequency).toBe('semanal');
      expect(r.value.active).toBe(true);
    }
  });

  it('rechaza título vacío', async () => {
    const repo = makeFakeRepo();
    const r = await createRecurringTask(ctx(), repo, { title: '  ', frequency: 'semanal', nextDueOn: '2026-08-24' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('rechaza meta de otro proyecto (RULE_VIOLATION)', async () => {
    const repo = makeFakeRepo();
    const pA = await repo.insertProject({ title: 'A', areaId: 'ar' });
    const pB = await repo.insertProject({ title: 'B', areaId: 'ar' });
    const gA = await repo.insertGoal({ projectId: pA.id, title: 'Meta A', tz: 'America/Bogota' });
    const r = await createRecurringTask(ctx(), repo, {
      title: 'x',
      frequency: 'semanal',
      nextDueOn: '2026-08-24',
      projectId: pB.id,
      goalId: gA.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });
});

describe('generateDueRecurringTasks', () => {
  it('materializa UNA tarea por plantilla vencida y avanza saltando periodos perdidos', async () => {
    const repo = makeFakeRepo();
    // vencida hace varias semanas
    const rec = await createRecurringTask(ctx(), repo, {
      title: 'Revisar TV',
      frequency: 'semanal',
      nextDueOn: '2026-08-01',
    });
    if (!rec.ok) throw new Error('setup');
    const res = await generateDueRecurringTasks(ctx(), repo, '2026-08-24');
    expect(res.ok && res.value.created).toBe(1); // una sola, no una pila
    // se creó una tarea real
    const tasks = [...repo._tasks.values()];
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.title).toBe('Revisar TV');
    // next_due_on quedó estrictamente en el futuro
    const after = await repo.getRecurringTask(rec.value.id);
    expect(after!.nextDueOn > '2026-08-24').toBe(true);
  });

  it('no materializa las que aún no vencen', async () => {
    const repo = makeFakeRepo();
    await createRecurringTask(ctx(), repo, { title: 'Futura', frequency: 'mensual', nextDueOn: '2026-12-01' });
    const res = await generateDueRecurringTasks(ctx(), repo, '2026-08-24');
    expect(res.ok && res.value.created).toBe(0);
    expect([...repo._tasks.values()].length).toBe(0);
  });

  it('idempotente: correr dos veces no duplica', async () => {
    const repo = makeFakeRepo();
    await createRecurringTask(ctx(), repo, { title: 'x', frequency: 'semanal', nextDueOn: '2026-08-20' });
    await generateDueRecurringTasks(ctx(), repo, '2026-08-24');
    const res2 = await generateDueRecurringTasks(ctx(), repo, '2026-08-24');
    expect(res2.ok && res2.value.created).toBe(0);
    expect([...repo._tasks.values()].length).toBe(1);
  });
});

describe('update / delete', () => {
  it('actualiza frecuencia y próxima fecha', async () => {
    const repo = makeFakeRepo();
    const r = await createRecurringTask(ctx(), repo, { title: 'x', frequency: 'semanal', nextDueOn: '2026-08-24' });
    if (!r.ok) throw new Error('setup');
    const u = await updateRecurringTask(ctx(), repo, { id: r.value.id, frequency: 'mensual', nextDueOn: '2026-09-01' });
    expect(u.ok && u.value.frequency).toBe('mensual');
    expect(u.ok && u.value.nextDueOn).toBe('2026-09-01');
  });

  it('borra la plantilla', async () => {
    const repo = makeFakeRepo();
    const r = await createRecurringTask(ctx(), repo, { title: 'x', frequency: 'semanal', nextDueOn: '2026-08-24' });
    if (!r.ok) throw new Error('setup');
    const d = await deleteRecurringTask(ctx(), repo, r.value.id);
    expect(d.ok).toBe(true);
    expect(await repo.getRecurringTask(r.value.id)).toBeNull();
  });
});
