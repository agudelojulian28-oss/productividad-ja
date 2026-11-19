// Puerto de datos del módulo salud. Plan jerárquico (rutina → ejercicios, hora dorada →
// pasos), check-ins diarios, lista de mercado y ajustes (vínculo con Finanzas).

export type HealthSection = 'entrenamiento' | 'dieta' | 'cuerpo' | 'espiritual';
export type HealthKind =
  | 'rutina'
  | 'ejercicio'
  | 'comida'
  | 'salvavidas'
  | 'tratamiento'
  | 'compromiso'
  | 'habito';
export type GroceryFrequency = 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'anual';

export interface HealthItemRow {
  id: string;
  section: HealthSection;
  kind: HealthKind;
  parentId: string | null;
  title: string;
  detail: string | null;
  timeOfDay: string | null; // 'HH:MM'
  durationMin: number | null;
  weekdays: number[] | null; // ISO 1=lunes … 7=domingo; null = todos los días
  trackable: boolean;
  needsReview: boolean;
  sortOrder: number;
  active: boolean;
}
export interface HealthItemInsert {
  section: HealthSection;
  kind: HealthKind;
  parentId?: string | null;
  title: string;
  detail?: string | null;
  timeOfDay?: string | null;
  durationMin?: number | null;
  weekdays?: number[] | null;
  trackable?: boolean;
  needsReview?: boolean;
  sortOrder?: number;
}
export type HealthItemPatch = Partial<Omit<HealthItemInsert, 'section' | 'kind' | 'parentId'>> & {
  active?: boolean;
};

export interface CheckinRow {
  itemId: string;
  day: string; // 'YYYY-MM-DD'
}

export interface GroceryRow {
  id: string;
  name: string;
  quantity: string | null;
  costMinor: number;
  frequency: GroceryFrequency;
  checked: boolean;
  sortOrder: number;
  active: boolean;
}
export interface GroceryInsert {
  name: string;
  quantity?: string | null;
  costMinor?: number;
  frequency?: GroceryFrequency;
  sortOrder?: number;
}
export type GroceryPatch = Partial<GroceryInsert> & { checked?: boolean; active?: boolean };

export interface HealthSettingsRow {
  groceryRecurringId: string | null;
  groceryProjectId: string | null;
  seededAt: string | null;
}
export type HealthSettingsPatch = Partial<HealthSettingsRow>;

export interface HealthRepo {
  listItems(): Promise<HealthItemRow[]>;
  getItem(id: string): Promise<HealthItemRow | null>;
  insertItem(input: HealthItemInsert): Promise<HealthItemRow>;
  updateItem(id: string, patch: HealthItemPatch): Promise<HealthItemRow>;
  deleteItem(id: string): Promise<void>;

  listCheckins(fromYmd: string, toYmd: string): Promise<CheckinRow[]>;
  /** Marca (done=true, idempotente) o desmarca (done=false) un elemento en un día. */
  setCheckin(itemId: string, day: string, done: boolean): Promise<void>;

  listGroceries(): Promise<GroceryRow[]>;
  getGrocery(id: string): Promise<GroceryRow | null>;
  insertGrocery(input: GroceryInsert): Promise<GroceryRow>;
  updateGrocery(id: string, patch: GroceryPatch): Promise<GroceryRow>;
  deleteGrocery(id: string): Promise<void>;
  /** Desmarca todo lo comprado (nueva vuelta de mercado). */
  resetGroceriesChecked(): Promise<void>;

  getSettings(): Promise<HealthSettingsRow | null>;
  upsertSettings(patch: HealthSettingsPatch): Promise<HealthSettingsRow>;
  /** Reclama la precarga de forma atómica: true solo para la PRIMERA llamada (marca
   *  seeded_at si estaba vacío). Evita duplicar el plan si dos páginas cargan a la vez. */
  claimSeed(): Promise<boolean>;
}
