import type { SupabaseClient } from '@supabase/supabase-js';
import type { StructureRepo, AreaRow, AreaKind } from '@/core/structure/ports';

interface DbArea {
  id: string;
  name: string;
  kind: AreaKind;
  position: number;
  description: string | null;
  archived_at: string | null;
}

const COLS = 'id,name,kind,position,description,archived_at';

function toRow(r: DbArea): AreaRow {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    position: r.position,
    description: r.description,
    archivedAt: r.archived_at,
  };
}

export function structureRepo(supabase: SupabaseClient, userId: string): StructureRepo {
  return {
    async listAreas(includeArchived = false) {
      let q = supabase.from('areas').select(COLS);
      if (!includeArchived) q = q.is('archived_at', null);
      const { data, error } = await q.order('position', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as DbArea[] | null) ?? []).map(toRow);
    },

    async getArea(id) {
      const { data, error } = await supabase
        .from('areas')
        .select(COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toRow(data as DbArea) : null;
    },

    async insertArea(input) {
      const { data, error } = await supabase
        .from('areas')
        .insert({ user_id: userId, name: input.name, kind: input.kind })
        .select(COLS)
        .single();
      if (error) throw new Error(error.code === '23505' ? 'DUPLICATE' : error.message);
      return toRow(data as DbArea);
    },

    async updateArea(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.name !== undefined) upd.name = patch.name;
      if (patch.description !== undefined) upd.description = patch.description;
      if (patch.archivedAt !== undefined) upd.archived_at = patch.archivedAt;
      const { data, error } = await supabase
        .from('areas')
        .update(upd)
        .eq('id', id)
        .select(COLS)
        .single();
      if (error) throw new Error(error.message);
      return toRow(data as DbArea);
    },
  };
}
