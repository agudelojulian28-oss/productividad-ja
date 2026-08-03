import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StructureRepo,
  AreaRow,
  AreaKind,
  DocumentRow,
  DocumentKind,
  DocumentAuthor,
  AttachmentRow,
} from '@/core/structure/ports';

interface DbAttachment {
  id: string;
  storage_path: string;
  mime: string;
  project_id: string | null;
  description: string | null;
  saved: boolean;
  created_at: string;
}

const ATT_COLS = 'id,storage_path,mime,project_id,description,saved,created_at';

function toAttachment(r: DbAttachment): AttachmentRow {
  return {
    id: r.id,
    storagePath: r.storage_path,
    mime: r.mime,
    projectId: r.project_id,
    description: r.description,
    saved: r.saved,
    createdAt: r.created_at,
  };
}

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

interface DbDocument {
  id: string;
  area_id: string | null;
  project_id: string | null;
  title: string;
  content: string;
  kind: DocumentKind;
  author: DocumentAuthor;
  pinned: boolean;
  updated_at: string;
}

const DOC_COLS = 'id,area_id,project_id,title,content,kind,author,pinned,updated_at';

function toDoc(r: DbDocument): DocumentRow {
  return {
    id: r.id,
    areaId: r.area_id,
    projectId: r.project_id,
    title: r.title,
    content: r.content,
    kind: r.kind,
    author: r.author,
    pinned: r.pinned,
    updatedAt: r.updated_at,
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

    async insertDocument(input) {
      const { data, error } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          area_id: input.areaId ?? null,
          project_id: input.projectId ?? null,
          title: input.title,
          content: input.content ?? '',
          kind: input.kind ?? 'nota',
          author: input.author ?? 'user',
        })
        .select(DOC_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toDoc(data as DbDocument);
    },

    async getDocument(id) {
      const { data, error } = await supabase
        .from('documents')
        .select(DOC_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDoc(data as DbDocument) : null;
    },

    async listDocuments(filter) {
      let q = supabase.from('documents').select(DOC_COLS);
      if (filter?.projectId) q = q.eq('project_id', filter.projectId);
      const { data, error } = await q
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as DbDocument[] | null) ?? []).map(toDoc);
    },

    async updateDocument(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.title !== undefined) upd.title = patch.title;
      if (patch.content !== undefined) upd.content = patch.content;
      if (patch.pinned !== undefined) upd.pinned = patch.pinned;
      const { data, error } = await supabase
        .from('documents')
        .update(upd)
        .eq('id', id)
        .select(DOC_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toDoc(data as DbDocument);
    },

    async deleteDocument(id) {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async insertAttachment(input) {
      const { data, error } = await supabase
        .from('attachments')
        .insert({ user_id: userId, storage_path: input.storagePath, mime: input.mime })
        .select(ATT_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toAttachment(data as DbAttachment);
    },

    async getAttachment(id) {
      const { data, error } = await supabase
        .from('attachments')
        .select(ATT_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toAttachment(data as DbAttachment) : null;
    },

    async updateAttachment(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.saved !== undefined) upd.saved = patch.saved;
      if (patch.projectId !== undefined) upd.project_id = patch.projectId;
      if (patch.description !== undefined) upd.description = patch.description;
      const { data, error } = await supabase
        .from('attachments')
        .update(upd)
        .eq('id', id)
        .select(ATT_COLS)
        .single();
      if (error) throw new Error(error.message);
      return toAttachment(data as DbAttachment);
    },

    async listSavedAttachments(projectId) {
      const { data, error } = await supabase
        .from('attachments')
        .select(ATT_COLS)
        .eq('project_id', projectId)
        .eq('saved', true)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as DbAttachment[] | null) ?? []).map(toAttachment);
    },
  };
}
