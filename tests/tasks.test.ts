import { describe, it, expect } from 'vitest';
import {
  createTask,
  completeTask,
  reopenTask,
  deleteTask,
  rescheduleTask,
  editTask,
} from '@/core/work/tasks';
import { makeFakeRepo, ctx } from './fake-repo';

const OFFSET_ISO = '2026-07-25T16:00:00-05:00';

describe('createTask', () => {
  it('crea con estado pendiente y origin manual cuando el actor es user', async () => {
    const repo = makeFakeRepo();
    const r = await createTask(ctx(), repo, { title: 'Comprar café' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.origin).toBe('manual');
      expect(r.value.status).toBe('pending');
      expect(r.value.title).toBe('Comprar café');
    }
  });

  it('marca origin agente cuando el actor es agent', async () => {
    const repo = makeFakeRepo();
    const r = await createTask(ctx({ actor: 'agent' }), repo, { title: 'x' });
    expect(r.ok && r.value.origin).toBe('agente');
  });

  it('rechaza título vacío (INVALID_INPUT)', async () => {
    const repo = makeFakeRepo();
    const r = await createTask(ctx(), repo, { title: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('rechaza fecha sin offset — trampa de fechas (INVALID_INPUT)', async () => {
    const repo = makeFakeRepo();
    const r = await createTask(ctx(), repo, { title: 'x', dueAt: '2026-07-25T16:00:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('acepta fecha ISO-8601 con offset explícito', async () => {
    const repo = makeFakeRepo();
    const r = await createTask(ctx(), repo, { title: 'x', dueAt: OFFSET_ISO });
    expect(r.ok && r.value.dueAt).toBe(OFFSET_ISO);
  });
});

describe('completeTask', () => {
  it('NOT_FOUND si la tarea no existe', async () => {
    const repo = makeFakeRepo();
    const r = await completeTask(ctx(), repo, '00000000-0000-4000-8000-000000000999');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('marca done con completedAt', async () => {
    const repo = makeFakeRepo();
    const c = await createTask(ctx(), repo, { title: 'x' });
    if (!c.ok) throw new Error('setup');
    const r = await completeTask(ctx(), repo, c.value.id);
    expect(r.ok && r.value.status).toBe('done');
    expect(r.ok && typeof r.value.completedAt === 'string').toBe(true);
  });

  it('es idempotente si ya está done', async () => {
    const repo = makeFakeRepo();
    const c = await createTask(ctx(), repo, { title: 'x' });
    if (!c.ok) throw new Error('setup');
    await completeTask(ctx(), repo, c.value.id);
    const again = await completeTask(ctx(), repo, c.value.id);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.status).toBe('done');
  });
});

describe('rescheduleTask', () => {
  it('rechaza uuid inválido (INVALID_INPUT)', async () => {
    const repo = makeFakeRepo();
    const r = await rescheduleTask(ctx(), repo, { id: 'no-uuid', dueAt: OFFSET_ISO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('NOT_FOUND si el id no existe', async () => {
    const repo = makeFakeRepo();
    const r = await rescheduleTask(ctx(), repo, {
      id: '00000000-0000-4000-8000-000000000999',
      dueAt: OFFSET_ISO,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('actualiza la fecha', async () => {
    const repo = makeFakeRepo();
    const c = await createTask(ctx(), repo, { title: 'x' });
    if (!c.ok) throw new Error('setup');
    const r = await rescheduleTask(ctx(), repo, { id: c.value.id, dueAt: OFFSET_ISO });
    expect(r.ok && r.value.dueAt).toBe(OFFSET_ISO);
  });
});

describe('editTask', () => {
  async function setup() {
    const repo = makeFakeRepo();
    const pA = await repo.insertProject({ title: 'Proyecto A', areaId: 'area-1' });
    const pB = await repo.insertProject({ title: 'Proyecto B', areaId: 'area-1' });
    const gA = await repo.insertGoal({ projectId: pA.id, title: 'Meta A', tz: 'America/Bogota' });
    const t = await createTask(ctx(), repo, { title: 'Original', projectId: pA.id, goalId: gA.id });
    if (!t.ok) throw new Error('setup');
    return { repo, pA, pB, gA, task: t.value };
  }

  it('renombra el título y edita notas', async () => {
    const { repo, task } = await setup();
    const r = await editTask(ctx(), repo, { id: task.id, title: 'Nuevo título', notes: 'algo' });
    expect(r.ok && r.value.title).toBe('Nuevo título');
    expect(r.ok && r.value.notes).toBe('algo');
  });

  it('limpia la fecha con dueAt null', async () => {
    const { repo, task } = await setup();
    await editTask(ctx(), repo, { id: task.id, dueAt: OFFSET_ISO });
    const r = await editTask(ctx(), repo, { id: task.id, dueAt: null });
    expect(r.ok && r.value.dueAt).toBeNull();
  });

  it('al mover a otro proyecto, limpia la meta que ya no corresponde', async () => {
    const { repo, pB, task } = await setup();
    const r = await editTask(ctx(), repo, { id: task.id, projectId: pB.id });
    expect(r.ok && r.value.projectId).toBe(pB.id);
    expect(r.ok && r.value.goalId).toBeNull();
  });

  it('asignar una meta deriva su proyecto', async () => {
    const { repo, pA, pB, gA, task } = await setup();
    // mover a B (limpia la meta), luego asignar la meta de A → el proyecto vuelve a A
    await editTask(ctx(), repo, { id: task.id, projectId: pB.id });
    const r = await editTask(ctx(), repo, { id: task.id, goalId: gA.id });
    expect(r.ok && r.value.goalId).toBe(gA.id);
    expect(r.ok && r.value.projectId).toBe(pA.id);
  });

  it('rechaza una meta de otro proyecto (RULE_VIOLATION)', async () => {
    const { repo, pB, gA, task } = await setup();
    const r = await editTask(ctx(), repo, { id: task.id, projectId: pB.id, goalId: gA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });

  it('NOT_FOUND si la tarea no existe', async () => {
    const repo = makeFakeRepo();
    const r = await editTask(ctx(), repo, {
      id: '00000000-0000-4000-8000-000000000999',
      title: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });
});

describe('deleteTask / reopenTask', () => {
  it('borra y luego la tarea ya no existe', async () => {
    const repo = makeFakeRepo();
    const c = await createTask(ctx(), repo, { title: 'x' });
    if (!c.ok) throw new Error('setup');
    const r = await deleteTask(ctx(), repo, c.value.id);
    expect(r.ok).toBe(true);
    expect(await repo.getTask(c.value.id)).toBeNull();
  });

  it('reopen devuelve a pending y limpia completedAt', async () => {
    const repo = makeFakeRepo();
    const c = await createTask(ctx(), repo, { title: 'x' });
    if (!c.ok) throw new Error('setup');
    await completeTask(ctx(), repo, c.value.id);
    const r = await reopenTask(ctx(), repo, c.value.id);
    expect(r.ok && r.value.status).toBe('pending');
    expect(r.ok && r.value.completedAt).toBeNull();
  });
});
