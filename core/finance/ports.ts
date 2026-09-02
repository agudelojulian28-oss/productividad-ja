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

/** Patch de un movimiento (valores efectivos ya calculados por el caso de uso). */
export interface TransactionPatch {
  direction: 'in' | 'out';
  amountMinor: number;
  currency: string;
  baseAmountMinor: number;
  fxRate: number;
  areaId: string;
  projectId: string | null;
  category: string | null;
  description: string | null;
  occurredOn: string;
}

/** Filtro de movimientos por rango de fechas y dirección (todo opcional). */
export interface TransactionFilter {
  from?: string; // YYYY-MM-DD (inclusive)
  to?: string; // YYYY-MM-DD (inclusive)
  direction?: 'in' | 'out';
  limit?: number;
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

export type RecurringFrequency =
  | 'semanal'
  | 'quincenal'
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'anual';

export interface RecurringExpenseRow {
  id: string;
  direction: 'in' | 'out';
  projectId: string;
  areaId: string;
  amountMinor: number;
  currency: string;
  category: string | null;
  description: string | null;
  frequency: RecurringFrequency;
  nextDueOn: string; // YYYY-MM-DD
  active: boolean;
}

export interface RecurringExpenseInsert {
  direction?: 'in' | 'out';
  projectId: string;
  areaId: string;
  amountMinor: number;
  currency: string;
  category?: string;
  description?: string;
  frequency: RecurringFrequency;
  nextDueOn: string;
}

// ── Sostenimiento (costos de operar la app) ────────────────────────────────
export type SustainingCategory = 'infra' | 'ia' | 'canal' | 'dominio' | 'otro';
export type SustainingStatus = 'paga' | 'gratis' | 'futuro';
export type SustainingCadence = 'mensual' | 'anual' | 'uso' | 'unico';

export interface SustainingServiceRow {
  id: string;
  name: string;
  provider: string | null;
  category: SustainingCategory;
  status: SustainingStatus;
  cadence: SustainingCadence;
  currency: 'COP' | 'USD';
  amountMinor: number; // en la moneda del servicio
  balanceMinor: number | null; // créditos restantes (prepago)
  alertThresholdMinor: number | null;
  renewsOn: string | null; // YYYY-MM-DD
  active: boolean;
  notes: string | null;
}
export interface SustainingServiceInsert {
  name: string;
  provider?: string | null;
  category: SustainingCategory;
  status: SustainingStatus;
  cadence: SustainingCadence;
  currency?: 'COP' | 'USD';
  amountMinor: number;
  balanceMinor?: number | null;
  alertThresholdMinor?: number | null;
  renewsOn?: string | null;
  notes?: string | null;
}
export interface SustainingServicePatch {
  name?: string;
  provider?: string | null;
  category?: SustainingCategory;
  status?: SustainingStatus;
  cadence?: SustainingCadence;
  currency?: 'COP' | 'USD';
  amountMinor?: number;
  balanceMinor?: number | null;
  alertThresholdMinor?: number | null;
  renewsOn?: string | null;
  active?: boolean;
  notes?: string | null;
}

// ── Reservas (flujo de caja + fondo de emergencia) ─────────────────────────
export type ReserveKind = 'flujo' | 'emergencia';

export interface ReserveFundRow {
  id: string;
  kind: ReserveKind;
  targetMinor: number; // meta (COP menor)
  description: string | null;
  projectId: string | null; // solo emergencia: proyecto dedicado del gasto
  areaId: string | null;
}
export interface ReserveFundPatch {
  targetMinor?: number;
  description?: string | null;
  projectId?: string | null;
  areaId?: string | null;
}
export interface ReserveMovementRow {
  id: string;
  fundId: string;
  direction: 'in' | 'out';
  amountMinor: number;
  occurredOn: string; // YYYY-MM-DD
  description: string | null;
  linkedTransactionId: string | null;
}
export interface ReserveMovementInsert {
  fundId: string;
  direction: 'in' | 'out';
  amountMinor: number;
  occurredOn?: string;
  description?: string | null;
  linkedTransactionId?: string | null;
}
/** Fila de la vista fin_reserve_summary (saldo ya calculado, en COP menor). */
export interface ReserveSummaryRow {
  fundId: string;
  kind: ReserveKind;
  targetMinor: number;
  description: string | null;
  projectId: string | null;
  inMinor: number;
  outMinor: number;
  balanceMinor: number;
  movements: number;
}

/** Etiqueta de un proyecto (clasifica movimientos y recurrentes de ese proyecto). */
export interface TagRow {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
}

export interface RecurringExpensePatch {
  amountMinor?: number;
  category?: string | null;
  description?: string | null;
  frequency?: RecurringFrequency;
  nextDueOn?: string;
  active?: boolean;
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
  projectId: string;
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
  projectId: string | null;
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
  getTransaction(id: string): Promise<TransactionRow | null>;
  updateTransaction(id: string, patch: TransactionPatch): Promise<TransactionRow>;
  deleteTransaction(id: string): Promise<void>;
  listRecentTransactions(limit?: number): Promise<TransactionRow[]>;
  /** Movimientos por rango de fechas (occurred_on) y dirección — filtrado en la BD. */
  listTransactions(filter?: TransactionFilter): Promise<TransactionRow[]>;
  byProject(): Promise<ByProjectRow[]>;

  insertRecurringExpense(input: RecurringExpenseInsert): Promise<RecurringExpenseRow>;
  listRecurringExpenses(): Promise<RecurringExpenseRow[]>;
  getRecurringExpense(id: string): Promise<RecurringExpenseRow | null>;
  updateRecurringExpense(id: string, patch: RecurringExpensePatch): Promise<RecurringExpenseRow>;
  deleteRecurringExpense(id: string): Promise<void>;

  // Etiquetas (por proyecto) + sus vínculos con movimientos y recurrentes.
  listTags(projectId?: string): Promise<TagRow[]>;
  getTag(id: string): Promise<TagRow | null>;
  insertTag(input: { name: string; color?: string | null; projectId: string }): Promise<TagRow>;
  updateTag(id: string, patch: { name?: string; color?: string | null }): Promise<TagRow>;
  deleteTag(id: string): Promise<void>;
  /** Reemplaza el conjunto de etiquetas de un movimiento por `tagIds`. */
  setTransactionTags(transactionId: string, tagIds: string[]): Promise<void>;
  /** Etiquetas por movimiento para una lista de ids: { transactionId, tagId }. */
  listTransactionTags(transactionIds: string[]): Promise<{ transactionId: string; tagId: string }[]>;
  setRecurringTags(recurringId: string, tagIds: string[]): Promise<void>;
  listRecurringTags(recurringIds: string[]): Promise<{ recurringId: string; tagId: string }[]>;

  insertMoneyGoal(input: MoneyGoalInsert): Promise<{ id: string }>;
  moneyGoalsProgress(): Promise<MoneyGoalProgressRow[]>;

  // Reservas (flujo de caja + fondo de emergencia).
  ensureReserves(): Promise<void>; // crea las filas flujo/emergencia si faltan
  listReserveFunds(): Promise<ReserveFundRow[]>;
  getReserveFund(kind: ReserveKind): Promise<ReserveFundRow | null>;
  updateReserveFund(id: string, patch: ReserveFundPatch): Promise<ReserveFundRow>;
  insertReserveMovement(input: ReserveMovementInsert): Promise<ReserveMovementRow>;
  listReserveMovements(fundId: string): Promise<ReserveMovementRow[]>;
  reserveSummary(): Promise<ReserveSummaryRow[]>;

  // Sostenimiento (costos de operar la app).
  insertSustaining(input: SustainingServiceInsert): Promise<SustainingServiceRow>;
  listSustaining(): Promise<SustainingServiceRow[]>;
  getSustaining(id: string): Promise<SustainingServiceRow | null>;
  updateSustaining(id: string, patch: SustainingServicePatch): Promise<SustainingServiceRow>;
  deleteSustaining(id: string): Promise<void>;

  cashflowMonthly(): Promise<CashflowMonthRow[]>;
  bySource(): Promise<BySourceRow[]>;
  expensesByCategory(): Promise<ExpenseCategoryRow[]>;
  receivables(): Promise<ReceivableRow[]>;
  pipeline(): Promise<PipelineRow[]>;
}
