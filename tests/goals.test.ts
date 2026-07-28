import { describe, it, expect } from 'vitest';
import { createGoal, listGoals } from '@/core/work/goals';
import { createTask } from '@/core/work/tasks';
import { makeFakeRepo, ctx } from './fake-repo';

const AREA = '00000000-0000-4000-8000-0000000000aa';

describe('createGoal', () => {
  it('crea una meta bajo un proyecto existente', async () => {
    const repo = makeFakeRepo();
    const project = await repo.insertProject({ title: 'Web', areaId: AREA });
    const r = await createGoal(ctx(), repo, { projectId: project.id, title: 'Lanzar v1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.projectId).toBe(project.id);
      expect(r.value.title).toBe('Lanzar v1');
    }
  });

  it('NOT_FOUND si el proyecto no existe', async () => {
    const repo = makeFakeRepo();
    const r = await createGoal(ctx(), repo, {
      projectId: '00000000-0000-4000-8000-000000000999',
      title: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('rechaza título vacío (INVALID_INPUT)', async () => {
    const repo = makeFakeRepo();
    const project = await repo.insertProject({ title: 'Web', areaId: AREA });
    const r = await createGoal(ctx(), repo, { projectId: project.id, title: '  ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });
});

describe('listGoals', () => {
  it('devuelve las metas del proyecto', async () => {
    const repo = makeFakeRepo();
    const p = await repo.insertProject({ title: 'Web', areaId: AREA });
    await createGoal(ctx(), repo, { projectId: p.id, title: 'A' });
    await createGoal(ctx(), repo, { projectId: p.id, title: 'B' });
    const r = await listGoals(ctx(), repo, p.id);
    expect(r.ok && r.value.length).toBe(2);
  });
});

describe('createTask con meta', () => {
  it('asocia la tarea a la meta y deriva el proyecto', async () => {
    const repo = makeFakeRepo();
    const p = await repo.insertProject({ title: 'Web', areaId: AREA });
    const g = await createGoal(ctx(), repo, { projectId: p.id, title: 'Meta' });
    if (!g.ok) throw new Error('setup');
    const r = await createTask(ctx(), repo, { title: 'Tarea', goalId: g.value.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.goalId).toBe(g.value.id);
      expect(r.value.projectId).toBe(p.id);
    }
  });

  it('NOT_FOUND si la meta no existe', async () => {
    const repo = makeFakeRepo();
    const r = await createTask(ctx(), repo, {
      title: 'x',
      goalId: '00000000-0000-4000-8000-000000000999',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('RULE_VIOLATION si la meta es de otro proyecto', async () => {
    const repo = makeFakeRepo();
    const p1 = await repo.insertProject({ title: 'P1', areaId: AREA });
    const p2 = await repo.insertProject({ title: 'P2', areaId: AREA });
    const g = await createGoal(ctx(), repo, { projectId: p1.id, title: 'Meta' });
    if (!g.ok) throw new Error('setup');
    const r = await createTask(ctx(), repo, {
      title: 'x',
      projectId: p2.id,
      goalId: g.value.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });

  it('crea tarea sin meta (meta opcional)', async () => {
    const repo = makeFakeRepo();
    const r = await createTask(ctx(), repo, { title: 'suelta' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.goalId).toBeNull();
  });
});
