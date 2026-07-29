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
import type { Result } from '@/core/types';
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
