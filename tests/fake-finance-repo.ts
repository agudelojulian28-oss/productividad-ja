// Repositorio de finanzas en memoria para probar los casos de uso sin base de datos.
import type {
  FinanceRepo,
  IncomeSourceRow,
  IncomeSourceInsert,
  TransactionRow,
  TransactionInsert,
} from '@/core/finance/ports';

export function makeFakeFinanceRepo(): FinanceRepo & {
  _sources: Map<string, IncomeSourceRow>;
  _txs: TransactionRow[];
} {
  const sources = new Map<string, IncomeSourceRow>();
  const txs: TransactionRow[] = [];
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    _sources: sources,
    _txs: txs,
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
        category: input.category ?? null,
      };
      txs.push(row);
      return row;
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
