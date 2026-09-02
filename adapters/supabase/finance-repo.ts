import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FinanceRepo,
  IncomeSourceRow,
  IncomeModel,
  TransactionRow,
  CashflowMonthRow,
  BySourceRow,
  ByProjectRow,
  RecurringExpenseRow,
  RecurringFrequency,
  TagRow,
  SustainingServiceRow,
  ExpenseCategoryRow,
  ReceivableRow,
  PipelineRow,
  MoneyGoalProgressRow,
  ReserveKind,
  ReserveFundRow,
  ReserveMovementRow,
  ReserveSummaryRow,
} from '@/core/finance/ports';

// Los sum() de bigint pueden volver como string desde PostgREST → Number() siempre.
const n = (v: unknown): number => Number(v ?? 0);

function toReserveFund(r: Record<string, unknown>): ReserveFundRow {
  return {
    id: r.id as string,
    kind: r.kind as ReserveKind,
    targetMinor: n(r.target_minor),
    description: (r.description as string | null) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    areaId: (r.area_id as string | null) ?? null,
  };
}
function toReserveMovement(r: Record<string, unknown>): ReserveMovementRow {
  return {
    id: r.id as string,
    fundId: r.fund_id as string,
    direction: r.direction as 'in' | 'out',
    amountMinor: n(r.amount_minor),
    occurredOn: r.occurred_on as string,
    description: (r.description as string | null) ?? null,
    linkedTransactionId: (r.linked_transaction_id as string | null) ?? null,
  };
}

interface DbIncomeSource {
  id: string;
  area_id: string;
  name: string;
  model: IncomeModel;
  status: 'active' | 'paused' | 'archived';
}

const SOURCE_COLS = 'id,area_id,name,model,status';

function toSource(r: DbIncomeSource): IncomeSourceRow {
  return { id: r.id, areaId: r.area_id, name: r.name, model: r.model, status: r.status };
}

interface DbTransaction {
  id: string;
  direction: 'in' | 'out';
  amount_minor: number | string;
  currency: string;
  base_amount_minor: number | string;
  fx_rate: number | string;
  occurred_on: string;
  area_id: string;
  income_source_id: string | null;
  project_id: string | null;
  category: string | null;
  description: string | null;
}

const TX_COLS =
  'id,direction,amount_minor,currency,base_amount_minor,fx_rate,occurred_on,area_id,income_source_id,project_id,category,description';

function toTx(r: DbTransaction): TransactionRow {
  return {
    id: r.id,
    direction: r.direction,
    amountMinor: n(r.amount_minor),
    currency: r.currency,
    baseAmountMinor: n(r.base_amount_minor),
    fxRate: n(r.fx_rate),
    occurredOn: r.occurred_on,
    areaId: r.area_id,
    incomeSourceId: r.income_source_id,
    projectId: r.project_id,
    category: r.category,
    description: r.description,
  };
}

interface DbRecurring {
  id: string;
  direction: 'in' | 'out';
  project_id: string;
  area_id: string;
  amount_minor: number | string;
  currency: string;
  category: string | null;
  description: string | null;
  frequency: RecurringFrequency;
  next_due_on: string;
  active: boolean;
}

const REC_COLS =
  'id,direction,project_id,area_id,amount_minor,currency,category,description,frequency,next_due_on,active';

const SUS_COLS =
  'id,name,provider,category,status,cadence,currency,amount_minor,balance_minor,alert_threshold_minor,renews_on,active,notes';
function toSustaining(r: Record<string, unknown>): SustainingServiceRow {
  return {
    id: r.id as string,
    name: r.name as string,
    provider: (r.provider as string | null) ?? null,
    category: r.category as SustainingServiceRow['category'],
    status: r.status as SustainingServiceRow['status'],
    cadence: r.cadence as SustainingServiceRow['cadence'],
    currency: (r.currency as 'COP' | 'USD') ?? 'COP',
    amountMinor: n(r.amount_minor),
    balanceMinor: r.balance_minor == null ? null : n(r.balance_minor),
    alertThresholdMinor: r.alert_threshold_minor == null ? null : n(r.alert_threshold_minor),
    renewsOn: (r.renews_on as string | null) ?? null,
    active: r.active as boolean,
    notes: (r.notes as string | null) ?? null,
  };
}

function toTag(r: Record<string, unknown>): TagRow {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    color: (r.color as string | null) ?? null,
  };
}

function toRecurring(r: DbRecurring): RecurringExpenseRow {
  return {
    id: r.id,
    direction: r.direction,
    projectId: r.project_id,
    areaId: r.area_id,
    amountMinor: n(r.amount_minor),
    currency: r.currency,
    category: r.category,
    description: r.description,
    frequency: r.frequency,
    nextDueOn: r.next_due_on,
    active: r.active,
  };
}

/** Implementación de FinanceRepo sobre Supabase. Usa la sesión del usuario:
 *  RLS y las vistas (security_invoker) garantizan que solo ve sus propias filas. */
export function financeRepo(supabase: SupabaseClient, userId: string): FinanceRepo {
  return {
    async insertIncomeSource(input) {
      const { data, error } = await supabase
        .from('income_sources')
        .insert({
          user_id: userId,
          area_id: input.areaId,
          name: input.name,
          model: input.model,
        })
        .select(SOURCE_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toSource(data as DbIncomeSource);
    },

    async listIncomeSources(areaId) {
      let q = supabase.from('income_sources').select(SOURCE_COLS).neq('status', 'archived');
      if (areaId) q = q.eq('area_id', areaId);
      const { data, error } = await q.order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as DbIncomeSource[] | null) ?? []).map(toSource);
    },

    async getIncomeSource(id) {
      const { data, error } = await supabase
        .from('income_sources')
        .select(SOURCE_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toSource(data as DbIncomeSource) : null;
    },

    async archiveIncomeSource(id) {
      const { error } = await supabase
        .from('income_sources')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },

    async insertTransaction(input) {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          area_id: input.areaId,
          income_source_id: input.incomeSourceId ?? null,
          project_id: input.projectId ?? null,
          direction: input.direction,
          amount_minor: input.amountMinor,
          currency: input.currency,
          base_amount_minor: input.baseAmountMinor,
          fx_rate: input.fxRate,
          occurred_on: input.occurredOn,
          category: input.category ?? null,
          description: input.description ?? null,
        })
        .select(TX_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toTx(data as DbTransaction);
    },

    async listRecentTransactions(limit = 30) {
      const { data, error } = await supabase
        .from('transactions')
        .select(TX_COLS)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return ((data as DbTransaction[] | null) ?? []).map(toTx);
    },

    async getTransaction(id) {
      const { data, error } = await supabase
        .from('transactions')
        .select(TX_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toTx(data as DbTransaction) : null;
    },

    async updateTransaction(id, patch) {
      const { data, error } = await supabase
        .from('transactions')
        .update({
          direction: patch.direction,
          amount_minor: patch.amountMinor,
          currency: patch.currency,
          base_amount_minor: patch.baseAmountMinor,
          fx_rate: patch.fxRate,
          area_id: patch.areaId,
          project_id: patch.projectId,
          category: patch.category,
          description: patch.description,
          occurred_on: patch.occurredOn,
        })
        .eq('id', id)
        .select(TX_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toTx(data as DbTransaction);
    },

    async deleteTransaction(id) {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async listTransactions(filter = {}) {
      const { from, to, direction, limit = 200 } = filter;
      let q = supabase
        .from('transactions')
        .select(TX_COLS)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (from) q = q.gte('occurred_on', from);
      if (to) q = q.lte('occurred_on', to);
      if (direction) q = q.eq('direction', direction);
      const { data, error } = await q.limit(limit);
      if (error) throw new Error(error.message);
      return ((data as DbTransaction[] | null) ?? []).map(toTx);
    },

    async insertMoneyGoal(input) {
      // Meta de dinero: metric money_in/money_net, en COP (base), atribuida a un proyecto.
      const { data, error } = await supabase
        .from('goals')
        .insert({
          user_id: userId,
          project_id: input.projectId,
          area_id: input.areaId ?? null,
          income_source_id: input.incomeSourceId ?? null,
          title: input.title,
          metric: input.metric,
          target_value: input.targetValue,
          currency: 'COP',
          manual_value: 0,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          status: 'active',
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },

    async moneyGoalsProgress() {
      const { data, error } = await supabase
        .from('goal_progress')
        .select('goal_id,title,metric,target_value,current_value,project_id,period_start,period_end,status')
        .in('metric', ['money_in', 'money_net'])
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map((r): MoneyGoalProgressRow => ({
        goalId: r.goal_id as string,
        title: r.title as string,
        metric: r.metric as 'money_in' | 'money_net',
        targetValue: n(r.target_value),
        currentValue: n(r.current_value),
        projectId: (r.project_id as string | null) ?? null,
        periodStart: r.period_start as string,
        periodEnd: r.period_end as string,
        status: r.status as string,
      }));
    },

    // ── Sostenimiento ────────────────────────────────────────────────────────
    async insertSustaining(input) {
      const { data, error } = await supabase
        .from('sustaining_services')
        .insert({
          user_id: userId,
          name: input.name,
          provider: input.provider ?? null,
          category: input.category,
          status: input.status,
          cadence: input.cadence,
          currency: input.currency ?? 'COP',
          amount_minor: input.amountMinor,
          balance_minor: input.balanceMinor ?? null,
          alert_threshold_minor: input.alertThresholdMinor ?? null,
          renews_on: input.renewsOn ?? null,
          notes: input.notes ?? null,
        })
        .select(SUS_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toSustaining(data as Record<string, unknown>);
    },

    async listSustaining() {
      const { data, error } = await supabase
        .from('sustaining_services')
        .select(SUS_COLS)
        .order('status', { ascending: true })
        .order('amount_minor', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(toSustaining);
    },

    async getSustaining(id) {
      const { data, error } = await supabase
        .from('sustaining_services')
        .select(SUS_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toSustaining(data as Record<string, unknown>) : null;
    },

    async updateSustaining(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.name !== undefined) upd.name = patch.name;
      if (patch.provider !== undefined) upd.provider = patch.provider;
      if (patch.category !== undefined) upd.category = patch.category;
      if (patch.status !== undefined) upd.status = patch.status;
      if (patch.cadence !== undefined) upd.cadence = patch.cadence;
      if (patch.currency !== undefined) upd.currency = patch.currency;
      if (patch.amountMinor !== undefined) upd.amount_minor = patch.amountMinor;
      if (patch.balanceMinor !== undefined) upd.balance_minor = patch.balanceMinor;
      if (patch.alertThresholdMinor !== undefined) upd.alert_threshold_minor = patch.alertThresholdMinor;
      if (patch.renewsOn !== undefined) upd.renews_on = patch.renewsOn;
      if (patch.active !== undefined) upd.active = patch.active;
      if (patch.notes !== undefined) upd.notes = patch.notes;
      const { data, error } = await supabase
        .from('sustaining_services')
        .update(upd)
        .eq('id', id)
        .select(SUS_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toSustaining(data as Record<string, unknown>);
    },

    async deleteSustaining(id) {
      const { error } = await supabase.from('sustaining_services').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    // ── Reservas ──────────────────────────────────────────────────────────
    async ensureReserves() {
      const { data, error } = await supabase.from('reserve_funds').select('kind');
      if (error) throw new Error(error.message);
      const have = new Set((data as { kind: string }[] | null)?.map((r) => r.kind) ?? []);
      const missing = (['flujo', 'emergencia'] as const).filter((k) => !have.has(k));
      if (missing.length === 0) return;
      const { error: insErr } = await supabase
        .from('reserve_funds')
        .insert(missing.map((kind) => ({ user_id: userId, kind })));
      if (insErr && !/duplicate key/i.test(insErr.message)) throw new Error(insErr.message);
    },
    async listReserveFunds() {
      const { data, error } = await supabase
        .from('reserve_funds')
        .select('id,kind,target_minor,description,project_id,area_id');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(toReserveFund);
    },
    async getReserveFund(kind) {
      const { data, error } = await supabase
        .from('reserve_funds')
        .select('id,kind,target_minor,description,project_id,area_id')
        .eq('kind', kind)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toReserveFund(data as Record<string, unknown>) : null;
    },
    async updateReserveFund(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.targetMinor !== undefined) upd.target_minor = patch.targetMinor;
      if (patch.description !== undefined) upd.description = patch.description;
      if (patch.projectId !== undefined) upd.project_id = patch.projectId;
      if (patch.areaId !== undefined) upd.area_id = patch.areaId;
      const { data, error } = await supabase
        .from('reserve_funds')
        .update(upd)
        .eq('id', id)
        .select('id,kind,target_minor,description,project_id,area_id')
        .single();
      if (error) throw new Error(error.message);
      return toReserveFund(data as Record<string, unknown>);
    },
    async insertReserveMovement(input) {
      const { data, error } = await supabase
        .from('reserve_movements')
        .insert({
          user_id: userId,
          fund_id: input.fundId,
          direction: input.direction,
          amount_minor: input.amountMinor,
          occurred_on: input.occurredOn ?? undefined,
          description: input.description ?? null,
          linked_transaction_id: input.linkedTransactionId ?? null,
        })
        .select('id,fund_id,direction,amount_minor,occurred_on,description,linked_transaction_id')
        .single();
      if (error) throw new Error(error.message);
      return toReserveMovement(data as Record<string, unknown>);
    },
    async listReserveMovements(fundId) {
      const { data, error } = await supabase
        .from('reserve_movements')
        .select('id,fund_id,direction,amount_minor,occurred_on,description,linked_transaction_id')
        .eq('fund_id', fundId)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(toReserveMovement);
    },
    async reserveSummary() {
      const { data, error } = await supabase
        .from('fin_reserve_summary')
        .select('fund_id,kind,target_minor,description,project_id,in_minor,out_minor,balance_minor,movements');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(
        (r): ReserveSummaryRow => ({
          fundId: r.fund_id as string,
          kind: r.kind as ReserveKind,
          targetMinor: n(r.target_minor),
          description: (r.description as string | null) ?? null,
          projectId: (r.project_id as string | null) ?? null,
          inMinor: n(r.in_minor),
          outMinor: n(r.out_minor),
          balanceMinor: n(r.balance_minor),
          movements: n(r.movements),
        }),
      );
    },

    async cashflowMonthly() {
      const { data, error } = await supabase
        .from('fin_cashflow_monthly')
        .select('area_id,month,inflow_minor,outflow_minor,net_minor,movements,last_recorded_at')
        .order('month', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(
        (r): CashflowMonthRow => ({
          areaId: r.area_id as string,
          month: r.month as string,
          inflowMinor: n(r.inflow_minor),
          outflowMinor: n(r.outflow_minor),
          netMinor: n(r.net_minor),
          movements: n(r.movements),
          lastRecordedAt: (r.last_recorded_at as string | null) ?? null,
        }),
      );
    },

    async bySource() {
      const { data, error } = await supabase
        .from('fin_by_source')
        .select('income_source_id,name,model,area,this_month_minor,last_month_minor,ttm_minor')
        .order('this_month_minor', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(
        (r): BySourceRow => ({
          incomeSourceId: r.income_source_id as string,
          name: r.name as string,
          model: r.model as string,
          area: r.area as string,
          thisMonthMinor: n(r.this_month_minor),
          lastMonthMinor: n(r.last_month_minor),
          ttmMinor: n(r.ttm_minor),
        }),
      );
    },

    async byProject() {
      const { data, error } = await supabase
        .from('fin_by_project')
        .select('project_id,month,inflow_minor,outflow_minor,net_minor,movements');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(
        (r): ByProjectRow => ({
          projectId: r.project_id as string,
          month: r.month as string,
          inflowMinor: n(r.inflow_minor),
          outflowMinor: n(r.outflow_minor),
          netMinor: n(r.net_minor),
          movements: n(r.movements),
        }),
      );
    },

    async insertRecurringExpense(input) {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .insert({
          user_id: userId,
          direction: input.direction ?? 'out',
          project_id: input.projectId,
          area_id: input.areaId,
          amount_minor: input.amountMinor,
          currency: input.currency,
          category: input.category ?? null,
          description: input.description ?? null,
          frequency: input.frequency,
          next_due_on: input.nextDueOn,
        })
        .select(REC_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toRecurring(data as DbRecurring);
    },

    async listRecurringExpenses() {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select(REC_COLS)
        .eq('active', true)
        .order('next_due_on', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as DbRecurring[] | null) ?? []).map(toRecurring);
    },

    async getRecurringExpense(id) {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select(REC_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toRecurring(data as DbRecurring) : null;
    },

    async updateRecurringExpense(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.amountMinor !== undefined) upd.amount_minor = patch.amountMinor;
      if (patch.category !== undefined) upd.category = patch.category;
      if (patch.description !== undefined) upd.description = patch.description;
      if (patch.frequency !== undefined) upd.frequency = patch.frequency;
      if (patch.nextDueOn !== undefined) upd.next_due_on = patch.nextDueOn;
      if (patch.active !== undefined) upd.active = patch.active;
      const { data, error } = await supabase
        .from('recurring_expenses')
        .update(upd)
        .eq('id', id)
        .select(REC_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toRecurring(data as DbRecurring);
    },

    async deleteRecurringExpense(id) {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    // ── Etiquetas (por proyecto) ───────────────────────────────────────────
    async listTags(projectId) {
      let q = supabase.from('tags').select('id,project_id,name,color').order('name', { ascending: true });
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(toTag);
    },

    async getTag(id) {
      const { data, error } = await supabase
        .from('tags')
        .select('id,project_id,name,color')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toTag(data as Record<string, unknown>) : null;
    },

    async insertTag(input) {
      const { data, error } = await supabase
        .from('tags')
        .insert({ user_id: userId, project_id: input.projectId, name: input.name, color: input.color ?? null })
        .select('id,project_id,name,color')
        .single();
      if (error) throw new Error(error.message);
      return toTag(data as Record<string, unknown>);
    },

    async updateTag(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.name !== undefined) upd.name = patch.name;
      if (patch.color !== undefined) upd.color = patch.color;
      const { data, error } = await supabase
        .from('tags')
        .update(upd)
        .eq('id', id)
        .select('id,project_id,name,color')
        .single();
      if (error) throw new Error(error.message);
      return toTag(data as Record<string, unknown>);
    },

    async deleteTag(id) {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async setTransactionTags(transactionId, tagIds) {
      // Reemplaza el conjunto: borra los actuales y vuelve a insertar.
      const del = await supabase
        .from('transaction_tags')
        .delete()
        .eq('transaction_id', transactionId);
      if (del.error) throw new Error(del.error.message);
      if (tagIds.length === 0) return;
      const rows = tagIds.map((tagId) => ({
        transaction_id: transactionId,
        tag_id: tagId,
        user_id: userId,
      }));
      const { error } = await supabase.from('transaction_tags').insert(rows);
      if (error) throw new Error(error.message);
    },

    async listTransactionTags(transactionIds) {
      if (transactionIds.length === 0) return [];
      const { data, error } = await supabase
        .from('transaction_tags')
        .select('transaction_id,tag_id')
        .in('transaction_id', transactionIds);
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        transactionId: r.transaction_id as string,
        tagId: r.tag_id as string,
      }));
    },

    async setRecurringTags(recurringId, tagIds) {
      const del = await supabase.from('recurring_tags').delete().eq('recurring_id', recurringId);
      if (del.error) throw new Error(del.error.message);
      if (tagIds.length === 0) return;
      const rows = tagIds.map((tagId) => ({
        recurring_id: recurringId,
        tag_id: tagId,
        user_id: userId,
      }));
      const { error } = await supabase.from('recurring_tags').insert(rows);
      if (error) throw new Error(error.message);
    },

    async listRecurringTags(recurringIds) {
      if (recurringIds.length === 0) return [];
      const { data, error } = await supabase
        .from('recurring_tags')
        .select('recurring_id,tag_id')
        .in('recurring_id', recurringIds);
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        recurringId: r.recurring_id as string,
        tagId: r.tag_id as string,
      }));
    },

    async expensesByCategory() {
      const { data, error } = await supabase
        .from('fin_expenses_by_category')
        .select('area_id,month,category,amount_minor,movements')
        .order('amount_minor', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(
        (r): ExpenseCategoryRow => ({
          areaId: r.area_id as string,
          month: r.month as string,
          category: r.category as string,
          amountMinor: n(r.amount_minor),
          movements: n(r.movements),
        }),
      );
    },

    async receivables() {
      const { data, error } = await supabase
        .from('fin_receivables')
        .select('sale_id,client,offering,outstanding_minor,days_outstanding,aging_bucket,marked_paid');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(
        (r): ReceivableRow => ({
          saleId: r.sale_id as string,
          client: (r.client as string | null) ?? null,
          offering: r.offering as string,
          outstandingMinor: n(r.outstanding_minor),
          daysOutstanding: n(r.days_outstanding),
          agingBucket: r.aging_bucket as string,
          markedPaid: Boolean(r.marked_paid),
        }),
      );
    },

    async pipeline() {
      const { data, error } = await supabase
        .from('fin_pipeline')
        .select('stage,deals,value_minor');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(
        (r): PipelineRow => ({
          stage: r.stage as string,
          deals: n(r.deals),
          valueMinor: n(r.value_minor),
        }),
      );
    },
  };
}
