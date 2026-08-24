'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { registrarMovimiento, updateTransaction, deleteTransaction } from '@/core/finance/transactions';
import {
  createIncomeSource,
  archiveIncomeSource,
} from '@/core/finance/income-sources';
import { createMoneyGoal } from '@/core/finance/goals';
import {
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  confirmRecurringExpense,
  skipRecurringExpense,
} from '@/core/finance/recurring';
import {
  createTag,
  updateTag,
  deleteTag,
  listTags,
  setTransactionTags,
  setRecurringTags,
} from '@/core/finance/tags';
import type { RecurringExpenseRow, RecurringFrequency, TagRow } from '@/core/finance/ports';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { uploadImage, signedUrl } from '@/adapters/supabase/storage';
import { registerAttachment } from '@/core/structure/attachments';
import { ok, err, type Result } from '@/core/types';
import { dayLabelInTz } from '@/lib/format';
import type { IncomeSourceRow, TransactionRow, IncomeModel } from '@/core/finance/ports';
import type { MovRow } from '@/app/(app)/finanzas/movimientos-recientes';

async function deps() {
  const { supabase, ctx } = await requireContext();
  return { ctx, repo: financeRepo(supabase, ctx.userId) };
}

/** Movimientos filtrados por rango de fechas (server-side) + dirección, listos para
 *  la lista (con nombre de proyecto y comprobante firmado). */
export async function listMovimientosAction(filter: {
  from?: string;
  to?: string;
  direction?: 'in' | 'out';
}): Promise<MovRow[]> {
  const { supabase, ctx } = await requireContext();
  const finance = financeRepo(supabase, ctx.userId);
  const structure = structureRepo(supabase, ctx.userId);
  const work = workRepo(supabase, ctx.userId);

  const [txs, projects] = await Promise.all([
    finance.listTransactions({ ...filter, limit: 200 }),
    work.listProjects(),
  ]);
  const projName = new Map(projects.map((p) => [p.id, p.title] as const));

  const attachments = await structure.listAttachmentsForTransactions(txs.map((t) => t.id));
  const receiptPath = new Map<string, string>();
  for (const a of attachments) {
    if (a.transactionId && !receiptPath.has(a.transactionId)) {
      receiptPath.set(a.transactionId, a.storagePath);
    }
  }
  const receiptUrl = new Map<string, string | null>();
  await Promise.all(
    [...receiptPath].map(async ([txId, path]) => {
      receiptUrl.set(txId, await signedUrl(supabase, path));
    }),
  );

  // Etiquetas por movimiento (un solo query para todos).
  const txTags = await finance.listTransactionTags(txs.map((t) => t.id));
  const tagsByTx = new Map<string, string[]>();
  for (const { transactionId, tagId } of txTags) {
    const cur = tagsByTx.get(transactionId) ?? [];
    cur.push(tagId);
    tagsByTx.set(transactionId, cur);
  }

  return txs.map((t) => ({
    id: t.id,
    direction: t.direction,
    baseAmountMinor: t.baseAmountMinor,
    occurredOn: dayLabelInTz(`${t.occurredOn}T12:00:00Z`, ctx.tz),
    title: t.description || t.category || (t.direction === 'in' ? 'Ingreso' : 'Gasto'),
    areaName: (t.projectId ? projName.get(t.projectId) : undefined) ?? '—',
    receiptUrl: receiptUrl.get(t.id) ?? null,
    projectId: t.projectId,
    category: t.category,
    description: t.description,
    amountMinor: t.amountMinor,
    currency: t.currency,
    fxRate: t.fxRate,
    occurredOnRaw: t.occurredOn,
    tagIds: tagsByTx.get(t.id) ?? [],
  }));
}

export async function createIncomeSourceAction(input: {
  areaId: string;
  name: string;
  model: IncomeModel;
}): Promise<Result<IncomeSourceRow>> {
  const { ctx, repo } = await deps();
  const result = await createIncomeSource(ctx, repo, input);
  revalidatePath('/finanzas');
  return result;
}

export async function archiveIncomeSourceAction(
  id: string,
): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await archiveIncomeSource(ctx, repo, id);
  revalidatePath('/finanzas');
  return result;
}

export async function createMoneyGoalAction(input: {
  title: string;
  metric: 'money_in' | 'money_net';
  targetValue: number;
  projectId: string;
  areaId?: string;
  incomeSourceId?: string;
  periodStart: string;
  periodEnd: string;
}): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await createMoneyGoal(ctx, repo, input);
  revalidatePath('/finanzas');
  return result;
}

export async function registrarMovimientoAction(input: {
  direction: 'in' | 'out';
  amountMinor: number;
  currency: 'COP' | 'USD';
  areaId: string;
  projectId: string;
  incomeSourceId?: string;
  category?: string;
  description?: string;
  occurredOn?: string;
  fxRate?: number;
  tagIds?: string[];
}): Promise<Result<TransactionRow>> {
  const { ctx, repo } = await deps();
  const result = await registrarMovimiento(ctx, repo, input);
  if (result.ok && input.tagIds) {
    await setTransactionTags(ctx, repo, { id: result.value.id, tagIds: input.tagIds });
  }
  revalidatePath('/finanzas');
  return result;
}

export async function updateMovimientoAction(input: {
  id: string;
  direction?: 'in' | 'out';
  amountMinor?: number;
  currency?: 'COP' | 'USD';
  fxRate?: number;
  projectId?: string;
  areaId?: string;
  category?: string | null;
  description?: string | null;
  occurredOn?: string;
  tagIds?: string[];
}): Promise<Result<TransactionRow>> {
  const { ctx, repo } = await deps();
  const result = await updateTransaction(ctx, repo, input);
  if (result.ok && input.tagIds) {
    await setTransactionTags(ctx, repo, { id: input.id, tagIds: input.tagIds });
  }
  revalidatePath('/finanzas');
  revalidatePath('/hoy');
  return result;
}

export async function deleteMovimientoAction(id: string): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await deleteTransaction(ctx, repo, id);
  revalidatePath('/finanzas');
  revalidatePath('/hoy');
  return result;
}

// ── Gastos / ingresos recurrentes ────────────────────────────────────────────
export async function createRecurringExpenseAction(input: {
  direction?: 'in' | 'out';
  projectId: string;
  areaId: string;
  amountMinor: number;
  category?: string;
  description?: string;
  frequency: RecurringFrequency;
  nextDueOn: string;
  tagIds?: string[];
}): Promise<Result<RecurringExpenseRow>> {
  const { ctx, repo } = await deps();
  const result = await createRecurringExpense(ctx, repo, input);
  if (result.ok && input.tagIds) {
    await setRecurringTags(ctx, repo, { id: result.value.id, tagIds: input.tagIds });
  }
  revalidatePath('/finanzas');
  return result;
}

export async function updateRecurringExpenseAction(input: {
  id: string;
  amountMinor?: number;
  category?: string | null;
  description?: string | null;
  frequency?: RecurringFrequency;
  nextDueOn?: string;
  active?: boolean;
  tagIds?: string[];
}): Promise<Result<RecurringExpenseRow>> {
  const { ctx, repo } = await deps();
  const result = await updateRecurringExpense(ctx, repo, input);
  if (result.ok && input.tagIds) {
    await setRecurringTags(ctx, repo, { id: input.id, tagIds: input.tagIds });
  }
  revalidatePath('/finanzas');
  return result;
}

export async function deleteRecurringExpenseAction(id: string): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await deleteRecurringExpense(ctx, repo, id);
  revalidatePath('/finanzas');
  return result;
}

/** Confirma un gasto recurrente vencido: crea la transacción (monto editable), avanza la
 *  fecha y, si viene comprobante, lo adjunta. */
export async function confirmRecurringExpenseAction(input: {
  id: string;
  amountMinor?: number;
  occurredOn?: string;
  receipt?: { mediaType: string; data: string } | null;
}): Promise<Result<{ transactionId: string }>> {
  const { supabase, ctx } = await requireContext();
  const repo = financeRepo(supabase, ctx.userId);
  const tx = await confirmRecurringExpense(ctx, repo, {
    id: input.id,
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
  });
  if (!tx.ok) return tx;

  if (input.receipt?.data) {
    try {
      const path = await uploadImage(
        supabase,
        ctx.userId,
        Buffer.from(input.receipt.data, 'base64'),
        input.receipt.mediaType,
      );
      await registerAttachment(ctx, structureRepo(supabase, ctx.userId), {
        storagePath: path,
        mime: input.receipt.mediaType,
        transactionId: tx.value.id,
        saved: true,
      });
    } catch {
      /* el movimiento quedó; el comprobante puede reintentarse después */
    }
  }
  revalidatePath('/finanzas');
  return ok({ transactionId: tx.value.id });
}

export async function skipRecurringExpenseAction(
  id: string,
): Promise<Result<{ id: string; nextDueOn: string }>> {
  const { ctx, repo } = await deps();
  const result = await skipRecurringExpense(ctx, repo, id);
  revalidatePath('/finanzas');
  return result;
}

// ── Etiquetas (por proyecto) ──────────────────────────────────────────────────
export async function listTagsAction(projectId?: string): Promise<TagRow[]> {
  const { ctx, repo } = await deps();
  const r = await listTags(ctx, repo, projectId);
  return r.ok ? r.value : [];
}

export async function createTagAction(input: {
  name: string;
  color?: string | null;
  projectId: string;
}): Promise<Result<TagRow>> {
  const { ctx, repo } = await deps();
  const result = await createTag(ctx, repo, input);
  revalidatePath('/finanzas');
  return result;
}

export async function updateTagAction(input: {
  id: string;
  name?: string;
  color?: string | null;
}): Promise<Result<TagRow>> {
  const { ctx, repo } = await deps();
  const result = await updateTag(ctx, repo, input);
  revalidatePath('/finanzas');
  return result;
}

export async function deleteTagAction(id: string): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await deleteTag(ctx, repo, id);
  revalidatePath('/finanzas');
  return result;
}

/** Sube el comprobante (imagen) y lo enlaza a un movimiento ya creado. */
export async function attachReceiptAction(input: {
  transactionId: string;
  mediaType: string;
  data: string; // base64
}): Promise<Result<{ id: string }>> {
  const { supabase, ctx } = await requireContext();
  try {
    const path = await uploadImage(
      supabase,
      ctx.userId,
      Buffer.from(input.data, 'base64'),
      input.mediaType,
    );
    const r = await registerAttachment(ctx, structureRepo(supabase, ctx.userId), {
      storagePath: path,
      mime: input.mediaType,
      transactionId: input.transactionId,
      saved: true,
    });
    revalidatePath('/finanzas');
    return r.ok ? ok({ id: r.value.id }) : r;
  } catch (e) {
    return err('EXTERNAL_ERROR', e instanceof Error ? e.message : 'No se pudo subir el comprobante');
  }
}

// ── Detalle de proyecto (se carga al abrir el modal) ────────────────────────────
export async function getProjectExtrasAction(input: {
  projectId: string;
  from: string;
  to: string;
}): Promise<{
  topCategorias: { category: string; amount: number }[];
  topEtiquetas: { name: string; amount: number }[];
  recurrentes: {
    id: string;
    title: string;
    amount: number;
    direction: 'in' | 'out';
    nextDueOn: string;
    vencido: boolean;
  }[];
  metas: {
    goalId: string;
    title: string;
    metric: 'money_in' | 'money_net';
    targetValue: number;
    currentValue: number;
  }[];
}> {
  const { ctx, repo } = await deps();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz }).format(new Date());
  const txs = (await repo.listTransactions({ from: input.from, to: input.to, limit: 1000 })).filter(
    (t) => t.projectId === input.projectId,
  );

  // Top categorías de gasto.
  const catMap = new Map<string, number>();
  for (const t of txs) {
    if (t.direction !== 'out') continue;
    const c = (t.category ?? '').trim() || 'Sin categoría';
    catMap.set(c, (catMap.get(c) ?? 0) + t.baseAmountMinor);
  }
  const topCategorias = [...catMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Top etiquetas (por monto de sus movimientos).
  const amountById = new Map(txs.map((t) => [t.id, t.baseAmountMinor] as const));
  const links = await repo.listTransactionTags(txs.map((t) => t.id));
  const tagNames = new Map((await repo.listTags(input.projectId)).map((t) => [t.id, t.name] as const));
  const tagMap = new Map<string, number>();
  for (const l of links) {
    const name = tagNames.get(l.tagId);
    if (!name) continue;
    tagMap.set(name, (tagMap.get(name) ?? 0) + (amountById.get(l.transactionId) ?? 0));
  }
  const topEtiquetas = [...tagMap.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Recurrentes ligados al proyecto (marca los vencidos).
  const recurrentes = (await repo.listRecurringExpenses())
    .filter((r) => r.projectId === input.projectId)
    .map((r) => ({
      id: r.id,
      title:
        r.description || r.category || (r.direction === 'in' ? 'Ingreso recurrente' : 'Gasto recurrente'),
      amount: r.amountMinor,
      direction: r.direction,
      nextDueOn: r.nextDueOn,
      vencido: r.nextDueOn <= today,
    }));

  // Metas de dinero del proyecto (progreso).
  const metas = (await repo.moneyGoalsProgress())
    .filter((g) => g.projectId === input.projectId)
    .map((g) => ({
      goalId: g.goalId,
      title: g.title,
      metric: g.metric,
      targetValue: g.targetValue,
      currentValue: g.currentValue,
    }));

  return { topCategorias, topEtiquetas, recurrentes, metas };
}
