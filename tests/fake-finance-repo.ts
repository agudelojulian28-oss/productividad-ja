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
      return [];
    },
    async bySource() {
      return [];
    },
    async expensesByCategory() {
      return [];
    },
    async receivables() {
      return [];
    },
    async pipeline() {
      return [];
    },
  };
}
