import { describe, it, expect } from 'vitest';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import {
  createTag,
  updateTag,
  deleteTag,
  listTags,
  setTransactionTags,
  setRecurringTags,
} from '@/core/finance/tags';
import { registrarMovimiento } from '@/core/finance/transactions';
import {
  createRecurringExpense,
  confirmRecurringExpense,
} from '@/core/finance/recurring';
import { ctx as makeCtx } from './fake-repo';

const ctx = makeCtx();
const PROJ = '00000000-0000-4000-8000-0000000000cc';
const AREA = '00000000-0000-4000-8000-0000000000aa';
const NOPE = '00000000-0000-4000-8000-0000000000ff';

describe('etiquetas', () => {
  it('crea, lista, renombra y evita duplicados (case-insensitive)', async () => {
    const repo = makeFakeFinanceRepo();
    const a = await createTag(ctx, repo, { name: 'Personal', color: '#22c55e' });
    expect(a.ok).toBe(true);

    const dup = await createTag(ctx, repo, { name: 'personal' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe('RULE_VIOLATION');

    const list = await listTags(ctx, repo);
    expect(list.ok && list.value.length).toBe(1);

    if (a.ok) {
      const upd = await updateTag(ctx, repo, { id: a.value.id, name: 'Personales', color: '#3b82f6' });
      expect(upd.ok && upd.value.name).toBe('Personales');
      expect(upd.ok && upd.value.color).toBe('#3b82f6');
    }
  });

  it('rechaza color inválido y nombre vacío', async () => {
    const repo = makeFakeFinanceRepo();
    const bad = await createTag(ctx, repo, { name: 'x', color: 'rojo' });
    expect(bad.ok).toBe(false);
    const empty = await createTag(ctx, repo, { name: '   ' });
    expect(empty.ok).toBe(false);
  });

  it('asigna etiquetas a un movimiento y valida que existan', async () => {
    const repo = makeFakeFinanceRepo();
    const tag = await createTag(ctx, repo, { name: 'comida' });
    const mov = await registrarMovimiento(ctx, repo, {
      direction: 'out',
      amountMinor: 50000,
      currency: 'COP',
      areaId: AREA,
      projectId: PROJ,
    });
    expect(tag.ok && mov.ok).toBe(true);
    if (!tag.ok || !mov.ok) return;

    const set = await setTransactionTags(ctx, repo, { id: mov.value.id, tagIds: [tag.value.id] });
    expect(set.ok).toBe(true);
    const linked = await repo.listTransactionTags([mov.value.id]);
    expect(linked).toEqual([{ transactionId: mov.value.id, tagId: tag.value.id }]);

    // Etiqueta inexistente → NOT_FOUND.
    const bad = await setTransactionTags(ctx, repo, {
      id: mov.value.id,
      tagIds: [NOPE],
    });
    expect(bad.ok).toBe(false);

    // Arreglo vacío quita todas.
    await setTransactionTags(ctx, repo, { id: mov.value.id, tagIds: [] });
    expect(await repo.listTransactionTags([mov.value.id])).toEqual([]);
  });

  it('borrar una etiqueta la quita de sus movimientos (cascada)', async () => {
    const repo = makeFakeFinanceRepo();
    const tag = await createTag(ctx, repo, { name: 'viajes' });
    const mov = await registrarMovimiento(ctx, repo, {
      direction: 'out',
      amountMinor: 10000,
      currency: 'COP',
      areaId: AREA,
      projectId: PROJ,
    });
    if (!tag.ok || !mov.ok) return;
    await setTransactionTags(ctx, repo, { id: mov.value.id, tagIds: [tag.value.id] });
    const del = await deleteTag(ctx, repo, tag.value.id);
    expect(del.ok).toBe(true);
    expect(await repo.listTransactionTags([mov.value.id])).toEqual([]);
  });
});

describe('recurrentes de ingreso', () => {
  it('crea un recurrente de ingreso y al confirmar registra un movimiento "in"', async () => {
    const repo = makeFakeFinanceRepo();
    const rec = await createRecurringExpense(ctx, repo, {
      direction: 'in',
      projectId: PROJ,
      areaId: AREA,
      amountMinor: 2_000_000,
      frequency: 'mensual',
      nextDueOn: '2026-09-01',
    });
    expect(rec.ok && rec.value.direction).toBe('in');
    if (!rec.ok) return;

    const conf = await confirmRecurringExpense(ctx, repo, { id: rec.value.id });
    expect(conf.ok && conf.value.direction).toBe('in');
    // La próxima fecha avanzó un mes.
    const after = await repo.getRecurringExpense(rec.value.id);
    expect(after?.nextDueOn).toBe('2026-10-01');
  });

  it('un recurrente sin direccion queda como gasto (out) por defecto', async () => {
    const repo = makeFakeFinanceRepo();
    const rec = await createRecurringExpense(ctx, repo, {
      projectId: PROJ,
      areaId: AREA,
      amountMinor: 90000,
      frequency: 'mensual',
      nextDueOn: '2026-09-05',
    });
    expect(rec.ok && rec.value.direction).toBe('out');
    if (!rec.ok) return;
    const tag = await createTag(ctx, repo, { name: 'suscripcion' });
    if (tag.ok) {
      const set = await setRecurringTags(ctx, repo, { id: rec.value.id, tagIds: [tag.value.id] });
      expect(set.ok).toBe(true);
      expect(await repo.listRecurringTags([rec.value.id])).toEqual([
        { recurringId: rec.value.id, tagId: tag.value.id },
      ]);
    }
  });
});
