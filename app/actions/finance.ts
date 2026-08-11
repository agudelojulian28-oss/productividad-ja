'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { registrarMovimiento } from '@/core/finance/transactions';
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
import type { RecurringExpenseRow, RecurringFrequency } from '@/core/finance/ports';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { uploadImage } from '@/adapters/supabase/storage';
import { registerAttachment } from '@/core/structure/attachments';
import { ok, err, type Result } from '@/core/types';
import type { IncomeSourceRow, TransactionRow, IncomeModel } from '@/core/finance/ports';

async function deps() {
  const { supabase, ctx } = await requireContext();
  return { ctx, repo: financeRepo(supabase, ctx.userId) };
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
}): Promise<Result<TransactionRow>> {
  const { ctx, repo } = await deps();
  const result = await registrarMovimiento(ctx, repo, input);
  revalidatePath('/finanzas');
  return result;
}

// ── Gastos recurrentes ──────────────────────────────────────────────────────
export async function createRecurringExpenseAction(input: {
  projectId: string;
  areaId: string;
  amountMinor: number;
  category?: string;
  description?: string;
  frequency: RecurringFrequency;
  nextDueOn: string;
}): Promise<Result<RecurringExpenseRow>> {
  const { ctx, repo } = await deps();
  const result = await createRecurringExpense(ctx, repo, input);
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
}): Promise<Result<RecurringExpenseRow>> {
  const { ctx, repo } = await deps();
  const result = await updateRecurringExpense(ctx, repo, input);
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
