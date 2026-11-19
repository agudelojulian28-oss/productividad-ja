import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HealthRepo,
  HealthItemRow,
  HealthItemPatch,
  GroceryRow,
  GroceryPatch,
  HealthSettingsRow,
  HealthSection,
  HealthKind,
  GroceryFrequency,
} from '@/core/health/ports';

const n = (v: unknown): number => Number(v ?? 0);

const ITEM_COLS =
  'id,section,kind,parent_id,title,detail,time_of_day,duration_min,weekdays,trackable,needs_review,sort_order,active';
const GROCERY_COLS = 'id,name,quantity,cost_minor,frequency,checked,sort_order,active';
const SETTINGS_COLS = 'grocery_recurring_id,grocery_project_id,seeded_at';

function toItem(r: Record<string, unknown>): HealthItemRow {
  const wd = r.weekdays as number[] | null;
  return {
    id: r.id as string,
    section: r.section as HealthSection,
    kind: r.kind as HealthKind,
    parentId: (r.parent_id as string | null) ?? null,
    title: r.title as string,
    detail: (r.detail as string | null) ?? null,
    timeOfDay: r.time_of_day ? String(r.time_of_day).slice(0, 5) : null, // 'HH:MM:SS' → 'HH:MM'
    durationMin: r.duration_min == null ? null : n(r.duration_min),
    weekdays: wd && wd.length ? wd.map(Number) : null,
    trackable: Boolean(r.trackable),
    needsReview: Boolean(r.needs_review),
    sortOrder: n(r.sort_order),
    active: Boolean(r.active),
  };
}
function toGrocery(r: Record<string, unknown>): GroceryRow {
  return {
    id: r.id as string,
    name: r.name as string,
    quantity: (r.quantity as string | null) ?? null,
    costMinor: n(r.cost_minor),
    frequency: r.frequency as GroceryFrequency,
    checked: Boolean(r.checked),
    sortOrder: n(r.sort_order),
    active: Boolean(r.active),
  };
}
function toSettings(r: Record<string, unknown>): HealthSettingsRow {
  return {
    groceryRecurringId: (r.grocery_recurring_id as string | null) ?? null,
    groceryProjectId: (r.grocery_project_id as string | null) ?? null,
    seededAt: (r.seeded_at as string | null) ?? null,
  };
}
function itemPatch(p: HealthItemPatch): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  if (p.title !== undefined) u.title = p.title;
  if (p.detail !== undefined) u.detail = p.detail;
  if (p.timeOfDay !== undefined) u.time_of_day = p.timeOfDay;
  if (p.durationMin !== undefined) u.duration_min = p.durationMin;
  if (p.weekdays !== undefined) u.weekdays = p.weekdays;
  if (p.trackable !== undefined) u.trackable = p.trackable;
  if (p.needsReview !== undefined) u.needs_review = p.needsReview;
  if (p.sortOrder !== undefined) u.sort_order = p.sortOrder;
  if (p.active !== undefined) u.active = p.active;
  return u;
}
function groceryPatch(p: GroceryPatch): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  if (p.name !== undefined) u.name = p.name;
  if (p.quantity !== undefined) u.quantity = p.quantity;
  if (p.costMinor !== undefined) u.cost_minor = p.costMinor;
  if (p.frequency !== undefined) u.frequency = p.frequency;
  if (p.checked !== undefined) u.checked = p.checked;
  if (p.sortOrder !== undefined) u.sort_order = p.sortOrder;
  if (p.active !== undefined) u.active = p.active;
  return u;
}

export function healthRepo(supabase: SupabaseClient, userId: string): HealthRepo {
  return {
    async listItems() {
      const { data, error } = await supabase.from('health_items').select(ITEM_COLS).order('sort_order');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(toItem);
    },
    async getItem(id) {
      const { data, error } = await supabase.from('health_items').select(ITEM_COLS).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toItem(data as Record<string, unknown>) : null;
    },
    async insertItem(input) {
      const { data, error } = await supabase
        .from('health_items')
        .insert({
          user_id: userId,
          section: input.section,
          kind: input.kind,
          parent_id: input.parentId ?? null,
          title: input.title,
          detail: input.detail ?? null,
          time_of_day: input.timeOfDay ?? null,
          duration_min: input.durationMin ?? null,
          weekdays: input.weekdays ?? null,
          trackable: input.trackable ?? false,
          needs_review: input.needsReview ?? false,
          sort_order: input.sortOrder ?? 0,
        })
        .select(ITEM_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toItem(data as Record<string, unknown>);
    },
    async updateItem(id, patch) {
      const { data, error } = await supabase
        .from('health_items')
        .update(itemPatch(patch))
        .eq('id', id)
        .select(ITEM_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toItem(data as Record<string, unknown>);
    },
    async deleteItem(id) {
      const { error } = await supabase.from('health_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async listCheckins(fromYmd, toYmd) {
      const { data, error } = await supabase
        .from('health_checkins')
        .select('item_id,day')
        .gte('day', fromYmd)
        .lte('day', toYmd);
      if (error) throw new Error(error.message);
      return ((data as { item_id: string; day: string }[] | null) ?? []).map((r) => ({
        itemId: r.item_id,
        day: String(r.day).slice(0, 10),
      }));
    },
    async setCheckin(itemId, day, done) {
      if (done) {
        const { error } = await supabase
          .from('health_checkins')
          .upsert({ user_id: userId, item_id: itemId, day }, { onConflict: 'item_id,day', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('health_checkins').delete().eq('item_id', itemId).eq('day', day);
        if (error) throw new Error(error.message);
      }
    },

    async listGroceries() {
      const { data, error } = await supabase.from('grocery_items').select(GROCERY_COLS).order('sort_order');
      if (error) throw new Error(error.message);
      return ((data as Record<string, unknown>[] | null) ?? []).map(toGrocery);
    },
    async getGrocery(id) {
      const { data, error } = await supabase.from('grocery_items').select(GROCERY_COLS).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toGrocery(data as Record<string, unknown>) : null;
    },
    async insertGrocery(input) {
      const { data, error } = await supabase
        .from('grocery_items')
        .insert({
          user_id: userId,
          name: input.name,
          quantity: input.quantity ?? null,
          cost_minor: input.costMinor ?? 0,
          frequency: input.frequency ?? 'semanal',
          sort_order: input.sortOrder ?? 0,
        })
        .select(GROCERY_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toGrocery(data as Record<string, unknown>);
    },
    async updateGrocery(id, patch) {
      const { data, error } = await supabase
        .from('grocery_items')
        .update(groceryPatch(patch))
        .eq('id', id)
        .select(GROCERY_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toGrocery(data as Record<string, unknown>);
    },
    async deleteGrocery(id) {
      const { error } = await supabase.from('grocery_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    async resetGroceriesChecked() {
      const { error } = await supabase.from('grocery_items').update({ checked: false }).eq('checked', true);
      if (error) throw new Error(error.message);
    },

    async getSettings() {
      const { data, error } = await supabase.from('health_settings').select(SETTINGS_COLS).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toSettings(data as Record<string, unknown>) : null;
    },
    async upsertSettings(patch) {
      const row: Record<string, unknown> = { user_id: userId };
      if (patch.groceryRecurringId !== undefined) row.grocery_recurring_id = patch.groceryRecurringId;
      if (patch.groceryProjectId !== undefined) row.grocery_project_id = patch.groceryProjectId;
      if (patch.seededAt !== undefined) row.seeded_at = patch.seededAt;
      const { data, error } = await supabase
        .from('health_settings')
        .upsert(row, { onConflict: 'user_id' })
        .select(SETTINGS_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toSettings(data as Record<string, unknown>);
    },
    async seedPlan(plan, groceries) {
      // Un solo viaje: la RPC reclama (seeded_at) e inserta todo en UNA transacción, con RLS
      // como el usuario (security invoker). Ver migración 20261119130000_salud_seed_atomico.
      const { data, error } = await supabase.rpc('seed_health_plan', {
        p_plan: plan,
        p_groceries: groceries,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
  };
}
