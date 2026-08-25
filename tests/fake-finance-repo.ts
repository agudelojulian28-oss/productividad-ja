// Repositorio de finanzas en memoria para probar los casos de uso sin base de datos.
import type {
  FinanceRepo,
  IncomeSourceRow,
  IncomeSourceInsert,
  TransactionRow,
  TransactionInsert,
  MoneyGoalInsert,
  MoneyGoalProgressRow,
  RecurringExpenseRow,
  TagRow,
  SustainingServiceRow,
} from '@/core/finance/ports';

export function makeFakeFinanceRepo(): FinanceRepo & {
  _sources: Map<string, IncomeSourceRow>;
  _txs: TransactionRow[];
  _goals: MoneyGoalProgressRow[];
  _recurring: Map<string, RecurringExpenseRow>;
  _tags: Map<string, TagRow>;
  _txTags: { transactionId: string; tagId: string }[];
  _recTags: { recurringId: string; tagId: string }[];
} {
  const sources = new Map<string, IncomeSourceRow>();
  const txs: TransactionRow[] = [];
  const goals: MoneyGoalProgressRow[] = [];
  const recurring = new Map<string, RecurringExpenseRow>();
  const tags = new Map<string, TagRow>();
  const sustaining = new Map<string, SustainingServiceRow>();
  let txTags: { transactionId: string; tagId: string }[] = [];
  let recTags: { recurringId: string; tagId: string }[] = [];
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    _sources: sources,
    _txs: txs,
    _goals: goals,
    _recurring: recurring,
    _tags: tags,
    _txTags: txTags,
    _recTags: recTags,
    async insertRecurringExpense(input) {
      const row: RecurringExpenseRow = {
        id: uuid(),
        direction: input.direction ?? 'out',
        projectId: input.projectId,
        areaId: input.areaId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        category: input.category ?? null,
        description: input.description ?? null,
        frequency: input.frequency,
        nextDueOn: input.nextDueOn,
        active: true,
      };
      recurring.set(row.id, row);
      return row;
    },
    async listRecurringExpenses() {
      return [...recurring.values()].filter((r) => r.active);
    },
    async getRecurringExpense(id: string) {
      return recurring.get(id) ?? null;
    },
    async updateRecurringExpense(id: string, patch) {
      const cur = recurring.get(id);
      if (!cur) throw new Error('updateRecurringExpense: no existe');
      const next: RecurringExpenseRow = {
        ...cur,
        amountMinor: patch.amountMinor ?? cur.amountMinor,
        category: patch.category === undefined ? cur.category : patch.category,
        description: patch.description === undefined ? cur.description : patch.description,
        frequency: patch.frequency ?? cur.frequency,
        nextDueOn: patch.nextDueOn ?? cur.nextDueOn,
        active: patch.active ?? cur.active,
      };
      recurring.set(id, next);
      return next;
    },
    async deleteRecurringExpense(id: string) {
      recurring.delete(id);
    },
    async listTags(projectId?: string): Promise<TagRow[]> {
      return [...tags.values()]
        .filter((t) => !projectId || t.projectId === projectId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async getTag(id: string): Promise<TagRow | null> {
      return tags.get(id) ?? null;
    },
    async insertTag(input): Promise<TagRow> {
      const row: TagRow = { id: uuid(), projectId: input.projectId, name: input.name, color: input.color ?? null };
      tags.set(row.id, row);
      return row;
    },
    async updateTag(id, patch): Promise<TagRow> {
      const cur = tags.get(id);
      if (!cur) throw new Error('updateTag: no existe');
      const next: TagRow = {
        ...cur,
        name: patch.name ?? cur.name,
        color: patch.color === undefined ? cur.color : patch.color,
      };
      tags.set(id, next);
      return next;
    },
    async deleteTag(id: string): Promise<void> {
      tags.delete(id);
      // Cascada de los vínculos (en memoria).
      txTags = txTags.filter((r) => r.tagId !== id);
      recTags = recTags.filter((r) => r.tagId !== id);
    },
    async setTransactionTags(transactionId: string, tagIds: string[]): Promise<void> {
      txTags = txTags.filter((r) => r.transactionId !== transactionId);
      for (const tagId of tagIds) txTags.push({ transactionId, tagId });
    },
    async listTransactionTags(transactionIds: string[]) {
      return txTags.filter((r) => transactionIds.includes(r.transactionId));
    },
    async setRecurringTags(recurringId: string, tagIds: string[]): Promise<void> {
      recTags = recTags.filter((r) => r.recurringId !== recurringId);
      for (const tagId of tagIds) recTags.push({ recurringId, tagId });
    },
    async listRecurringTags(recurringIds: string[]) {
      return recTags.filter((r) => recurringIds.includes(r.recurringId));
    },
    async insertMoneyGoal(input: MoneyGoalInsert): Promise<{ id: string }> {
      const id = uuid();
      goals.push({
        goalId: id,
        title: input.title,
        metric: input.metric,
        targetValue: input.targetValue,
        currentValue: 0,
        projectId: input.projectId ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'active',
      });
      return { id };
    },
    async moneyGoalsProgress(): Promise<MoneyGoalProgressRow[]> {
      return goals.filter((g) => g.status === 'active');
    },
    async insertSustaining(input): Promise<SustainingServiceRow> {
      const row: SustainingServiceRow = {
        id: uuid(),
        name: input.name,
        provider: input.provider ?? null,
        category: input.category,
        status: input.status,
        cadence: input.cadence,
        amountMinor: input.amountMinor,
        balanceMinor: input.balanceMinor ?? null,
        alertThresholdMinor: input.alertThresholdMinor ?? null,
        renewsOn: input.renewsOn ?? null,
        active: true,
        notes: input.notes ?? null,
      };
      sustaining.set(row.id, row);
      return row;
    },
    async listSustaining(): Promise<SustainingServiceRow[]> {
      return [...sustaining.values()];
    },
    async getSustaining(id: string): Promise<SustainingServiceRow | null> {
      return sustaining.get(id) ?? null;
    },
    async updateSustaining(id, patch): Promise<SustainingServiceRow> {
      const cur = sustaining.get(id);
      if (!cur) throw new Error('updateSustaining: no existe');
      const next: SustainingServiceRow = {
        ...cur,
        name: patch.name ?? cur.name,
        provider: patch.provider === undefined ? cur.provider : patch.provider,
        category: patch.category ?? cur.category,
        status: patch.status ?? cur.status,
        cadence: patch.cadence ?? cur.cadence,
        amountMinor: patch.amountMinor ?? cur.amountMinor,
        balanceMinor: patch.balanceMinor === undefined ? cur.balanceMinor : patch.balanceMinor,
        alertThresholdMinor:
          patch.alertThresholdMinor === undefined ? cur.alertThresholdMinor : patch.alertThresholdMinor,
        renewsOn: patch.renewsOn === undefined ? cur.renewsOn : patch.renewsOn,
        active: patch.active ?? cur.active,
        notes: patch.notes === undefined ? cur.notes : patch.notes,
      };
      sustaining.set(id, next);
      return next;
    },
    async deleteSustaining(id: string): Promise<void> {
      sustaining.delete(id);
    },
    async insertIncomeSource(input: IncomeSourceInsert): Promise<IncomeSourceRow> {
      const row: IncomeSourceRow = {
        id: uuid(),
        areaId: input.areaId,
        name: input.name,
        model: input.model,
        status: 'active',
      };
      sources.set(row.id, row);
      return row;
    },
    async listIncomeSources(areaId?: string): Promise<IncomeSourceRow[]> {
      return [...sources.values()].filter(
        (s) => s.status !== 'archived' && (!areaId || s.areaId === areaId),
      );
    },
    async getIncomeSource(id: string): Promise<IncomeSourceRow | null> {
      return sources.get(id) ?? null;
    },
    async archiveIncomeSource(id: string): Promise<void> {
      const cur = sources.get(id);
      if (cur) sources.set(id, { ...cur, status: 'archived' });
    },
    async insertTransaction(input: TransactionInsert): Promise<TransactionRow> {
      const row: TransactionRow = {
        id: uuid(),
        direction: input.direction,
        amountMinor: input.amountMinor,
        currency: input.currency,
        baseAmountMinor: input.baseAmountMinor,
        fxRate: input.fxRate,
        occurredOn: input.occurredOn,
        areaId: input.areaId,
        incomeSourceId: input.incomeSourceId ?? null,
        projectId: input.projectId ?? null,
        category: input.category ?? null,
        description: input.description ?? null,
      };
      txs.push(row);
      return row;
    },
    async getTransaction(id: string): Promise<TransactionRow | null> {
      return txs.find((t) => t.id === id) ?? null;
    },
    async updateTransaction(id, patch): Promise<TransactionRow> {
      const i = txs.findIndex((t) => t.id === id);
      if (i < 0) throw new Error('not found');
      const next: TransactionRow = { ...txs[i]!, ...patch };
      txs[i] = next;
      return next;
    },
    async deleteTransaction(id: string): Promise<void> {
      const i = txs.findIndex((t) => t.id === id);
      if (i >= 0) txs.splice(i, 1);
    },
    async listRecentTransactions(limit = 30): Promise<TransactionRow[]> {
      return [...txs]
        .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1))
        .slice(0, limit);
    },
    async listTransactions(filter = {}): Promise<TransactionRow[]> {
      const { from, to, direction, limit = 200 } = filter;
      return [...txs]
        .filter((t) => (from ? t.occurredOn >= from : true))
        .filter((t) => (to ? t.occurredOn <= to : true))
        .filter((t) => (direction ? t.direction === direction : true))
        .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1))
        .slice(0, limit);
    },
    async byProject() {
      const acc = new Map<string, { projectId: string; month: string; inflow: number; outflow: number; movs: number }>();
      for (const t of txs) {
        if (!t.projectId) continue;
        const month = `${t.occurredOn.slice(0, 7)}-01`;
        const key = `${t.projectId}|${month}`;
        const cur = acc.get(key) ?? { projectId: t.projectId, month, inflow: 0, outflow: 0, movs: 0 };
        if (t.direction === 'in') cur.inflow += t.baseAmountMinor;
        else cur.outflow += t.baseAmountMinor;
        cur.movs += 1;
        acc.set(key, cur);
      }
      return [...acc.values()].map((r) => ({
        projectId: r.projectId,
        month: r.month,
        inflowMinor: r.inflow,
        outflowMinor: r.outflow,
        netMinor: r.inflow - r.outflow,
        movements: r.movs,
      }));
    },
    async cashflowMonthly() {
      // Agrega _txs por (área, mes) como la vista fin_cashflow_monthly.
      const acc = new Map<string, { areaId: string; month: string; inflow: number; outflow: number; movs: number }>();
      for (const t of txs) {
        const month = `${t.occurredOn.slice(0, 7)}-01`;
        const key = `${t.areaId}|${month}`;
        const cur = acc.get(key) ?? { areaId: t.areaId, month, inflow: 0, outflow: 0, movs: 0 };
        if (t.direction === 'in') cur.inflow += t.baseAmountMinor;
        else cur.outflow += t.baseAmountMinor;
        cur.movs += 1;
        acc.set(key, cur);
      }
      return [...acc.values()].map((r) => ({
        areaId: r.areaId,
        month: r.month,
        inflowMinor: r.inflow,
        outflowMinor: r.outflow,
        netMinor: r.inflow - r.outflow,
        movements: r.movs,
        lastRecordedAt: new Date().toISOString(),
      }));
    },
    async bySource() {
      return [];
    },
    async expensesByCategory() {
      const acc = new Map<string, { areaId: string; month: string; category: string; amount: number; movs: number }>();
      for (const t of txs) {
        if (t.direction !== 'out') continue;
        const month = `${t.occurredOn.slice(0, 7)}-01`;
        const category = t.category?.trim() || 'sin categoría';
        const key = `${t.areaId}|${month}|${category}`;
        const cur = acc.get(key) ?? { areaId: t.areaId, month, category, amount: 0, movs: 0 };
        cur.amount += t.baseAmountMinor;
        cur.movs += 1;
        acc.set(key, cur);
      }
      return [...acc.values()].map((r) => ({
        areaId: r.areaId,
        month: r.month,
        category: r.category,
        amountMinor: r.amount,
        movements: r.movs,
      }));
    },
    async receivables() {
      return [];
    },
    async pipeline() {
      return [];
    },
  };
}
