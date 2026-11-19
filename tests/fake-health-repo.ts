// Repositorio de salud en memoria para probar casos de uso y agente sin base de datos.
import type {
  HealthRepo,
  HealthItemRow,
  HealthItemInsert,
  GroceryRow,
  HealthSettingsRow,
  CheckinRow,
} from '@/core/health/ports';

export function makeFakeHealthRepo(): HealthRepo & {
  _items: Map<string, HealthItemRow>;
  _checkins: CheckinRow[];
  _groceries: Map<string, GroceryRow>;
  _settings: () => HealthSettingsRow | null;
} {
  const items = new Map<string, HealthItemRow>();
  let checkins: CheckinRow[] = [];
  const groceries = new Map<string, GroceryRow>();
  let settings: HealthSettingsRow | null = null;
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const removeItemTree = (id: string) => {
    for (const it of [...items.values()]) if (it.parentId === id) removeItemTree(it.id);
    items.delete(id);
    checkins = checkins.filter((c) => c.itemId !== id);
  };

  return {
    _items: items,
    get _checkins() {
      return checkins;
    },
    _groceries: groceries,
    _settings: () => settings,

    async listItems() {
      return [...items.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async getItem(id) {
      return items.get(id) ?? null;
    },
    async insertItem(input) {
      const row: HealthItemRow = {
        id: uuid(),
        section: input.section,
        kind: input.kind,
        parentId: input.parentId ?? null,
        title: input.title,
        detail: input.detail ?? null,
        timeOfDay: input.timeOfDay ?? null,
        durationMin: input.durationMin ?? null,
        weekdays: input.weekdays ?? null,
        trackable: input.trackable ?? false,
        needsReview: input.needsReview ?? false,
        sortOrder: input.sortOrder ?? 0,
        active: true,
      };
      items.set(row.id, row);
      return row;
    },
    async updateItem(id, patch) {
      const cur = items.get(id);
      if (!cur) throw new Error('no existe');
      const next: HealthItemRow = { ...cur };
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
      items.set(id, next);
      return next;
    },
    async deleteItem(id) {
      removeItemTree(id);
    },

    async listCheckins(from, to) {
      return checkins.filter((c) => c.day >= from && c.day <= to);
    },
    async setCheckin(itemId, day, done) {
      const exists = checkins.some((c) => c.itemId === itemId && c.day === day);
      if (done && !exists) checkins.push({ itemId, day });
      if (!done) checkins = checkins.filter((c) => !(c.itemId === itemId && c.day === day));
    },

    async listGroceries() {
      return [...groceries.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async getGrocery(id) {
      return groceries.get(id) ?? null;
    },
    async insertGrocery(input) {
      const row: GroceryRow = {
        id: uuid(),
        name: input.name,
        quantity: input.quantity ?? null,
        costMinor: input.costMinor ?? 0,
        frequency: input.frequency ?? 'semanal',
        checked: false,
        sortOrder: input.sortOrder ?? 0,
        active: true,
      };
      groceries.set(row.id, row);
      return row;
    },
    async updateGrocery(id, patch) {
      const cur = groceries.get(id);
      if (!cur) throw new Error('no existe');
      const next: GroceryRow = { ...cur };
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
      groceries.set(id, next);
      return next;
    },
    async deleteGrocery(id) {
      groceries.delete(id);
    },
    async resetGroceriesChecked() {
      for (const [id, g] of groceries) groceries.set(id, { ...g, checked: false });
    },

    async getSettings() {
      return settings;
    },
    async upsertSettings(patch) {
      settings = {
        groceryRecurringId: null,
        groceryProjectId: null,
        seededAt: null,
        ...(settings ?? {}),
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      } as HealthSettingsRow;
      return settings;
    },
    async seedPlan(plan, seedGroceries) {
      // Síncrono por dentro (sin await entre el reclamo y las inserciones): emula la
      // transacción de la RPC, así dos llamadas simultáneas no se intercalan.
      if (settings?.seededAt) return false;
      settings = { groceryRecurringId: null, groceryProjectId: null, ...(settings ?? {}), seededAt: new Date().toISOString() };
      const add = (input: HealthItemInsert): HealthItemRow => {
        const row: HealthItemRow = {
          id: uuid(),
          section: input.section,
          kind: input.kind,
          parentId: input.parentId ?? null,
          title: input.title,
          detail: input.detail ?? null,
          timeOfDay: input.timeOfDay ?? null,
          durationMin: input.durationMin ?? null,
          weekdays: input.weekdays ?? null,
          trackable: input.trackable ?? false,
          needsReview: input.needsReview ?? false,
          sortOrder: input.sortOrder ?? 0,
          active: true,
        };
        items.set(row.id, row);
        return row;
      };
      if (items.size === 0) {
        for (const { children, ...node } of plan) {
          const parent = add({ ...node, parentId: null });
          for (const ch of children ?? []) add({ ...ch, section: node.section, parentId: parent.id });
        }
      }
      if (groceries.size === 0) {
        for (const g of seedGroceries) {
          const row: GroceryRow = {
            id: uuid(),
            name: g.name,
            quantity: g.quantity ?? null,
            costMinor: g.costMinor ?? 0,
            frequency: g.frequency ?? 'semanal',
            checked: false,
            sortOrder: g.sortOrder ?? 0,
            active: true,
          };
          groceries.set(row.id, row);
        }
      }
      return true;
    },
  };
}
