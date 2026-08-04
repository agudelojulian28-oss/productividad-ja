// Puerto de datos del módulo finance. Los montos son enteros en unidades menores
// (× 100). Las lecturas salen de las vistas fin_* (una cifra, una vista).

export type IncomeModel =
  | 'servicio'
  | 'producto'
  | 'suscripcion'
  | 'empleo'
  | 'inversion'
  | 'otro';

export interface IncomeSourceRow {
  id: string;
  areaId: string;
  name: string;
  model: IncomeModel;
  status: 'active' | 'paused' | 'archived';
}

export interface IncomeSourceInsert {
  areaId: string;
  name: string;
  model: IncomeModel;
}

export interface TransactionRow {
  id: string;
  direction: 'in' | 'out';
  amountMinor: number;
  currency: string;
  baseAmountMinor: number;
  fxRate: number;
  occurredOn: string; // YYYY-MM-DD
  areaId: string;
  incomeSourceId: string | null;
  projectId: string | null;
  category: string | null;
  description: string | null;
}

export interface TransactionInsert {
  areaId: string;
  incomeSourceId?: string;
  projectId?: string;
  direction: 'in' | 'out';
  amountMinor: number;
  currency: string;
  baseAmountMinor: number;
  fxRate: number;
  occurredOn: string;
  category?: string;
  description?: string;
}

export interface ByProjectRow {
  projectId: string;
  month: string; // YYYY-MM-DD (primero del mes)
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  movements: number;
}

// ── Filas de las vistas ────────────────────────────────────────────────────
export interface CashflowMonthRow {
  areaId: string;
  month: string; // YYYY-MM-DD (primero del mes)
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  movements: number;
  lastRecordedAt: string | null; // ISO
}

export interface BySourceRow {
  incomeSourceId: string;
  name: string;
  model: string;
  area: string;
  thisMonthMinor: number;
  lastMonthMinor: number;
  ttmMinor: number;
}

export interface ExpenseCategoryRow {
  areaId: string;
  month: string;
  category: string;
  amountMinor: number;
  movements: number;
}

export interface ReceivableRow {
  saleId: string;
  client: string | null;
  offering: string;
  outstandingMinor: number;
  daysOutstanding: number;
  agingBucket: string;
  markedPaid: boolean;
}

export interface PipelineRow {
  stage: string;
  deals: number;
  valueMinor: number;
}

export interface MoneyGoalInsert {
  title: string;
  metric: 'money_in' | 'money_net';
  targetValue: number; // en pesos (COP)
  areaId?: string;
  incomeSourceId?: string;
  periodStart: string;
  periodEnd: string;
}

// Fila de la vista goal_progress, ya con el progreso calculado (en pesos).
export interface MoneyGoalProgressRow {
  goalId: string;
  title: string;
  metric: 'money_in' | 'money_net';
  targetValue: number; // pesos
  currentValue: number; // pesos
  periodStart: string;
  periodEnd: string;
  status: string;
}

export interface FinanceRepo {
  insertIncomeSource(input: IncomeSourceInsert): Promise<IncomeSourceRow>;
  listIncomeSources(areaId?: string): Promise<IncomeSourceRow[]>;
  getIncomeSource(id: string): Promise<IncomeSourceRow | null>;
  archiveIncomeSource(id: string): Promise<void>;

  insertTransaction(input: TransactionInsert): Promise<TransactionRow>;
  listRecentTransactions(limit?: number): Promise<TransactionRow[]>;
  byProject(): Promise<ByProjectRow[]>;

  insertMoneyGoal(input: MoneyGoalInsert): Promise<{ id: string }>;
  moneyGoalsProgress(): Promise<MoneyGoalProgressRow[]>;

  cashflowMonthly(): Promise<CashflowMonthRow[]>;
  bySource(): Promise<BySourceRow[]>;
  expensesByCategory(): Promise<ExpenseCategoryRow[]>;
  receivables(): Promise<ReceivableRow[]>;
  pipeline(): Promise<PipelineRow[]>;
}
