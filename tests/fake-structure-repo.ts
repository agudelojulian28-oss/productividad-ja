// Structure repo en memoria para probar documentos sin base de datos.
import type {
  StructureRepo,
  AreaRow,
  AreaKind,
  DocumentRow,
  DocumentInsert,
  DocumentPatch,
} from '@/core/structure/ports';

export function makeFakeStructureRepo(): StructureRepo & {
  _docs: Map<string, DocumentRow>;
} {
  const areas = new Map<string, AreaRow>();
  const docs = new Map<string, DocumentRow>();
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    _docs: docs,
    async listAreas() {
      return [...areas.values()];
    },
    async getArea(id: string) {
      return areas.get(id) ?? null;
    },
    async insertArea(input: { name: string; kind: AreaKind }) {
      const row: AreaRow = {
        id: uuid(),
        name: input.name,
        kind: input.kind,
        position: areas.size,
        description: null,
        archivedAt: null,
      };
      areas.set(row.id, row);
      return row;
    },
    async updateArea(id, patch) {
      const cur = areas.get(id);
      if (!cur) throw new Error('updateArea: no existe');
      const next: AreaRow = {
        ...cur,
        name: patch.name ?? cur.name,
        description: patch.description === undefined ? cur.description : patch.description,
        archivedAt: patch.archivedAt === undefined ? cur.archivedAt : patch.archivedAt,
      };
      areas.set(id, next);
      return next;
    },

    async insertDocument(input: DocumentInsert) {
      const row: DocumentRow = {
        id: uuid(),
        areaId: input.areaId ?? null,
        projectId: input.projectId ?? null,
        title: input.title,
        content: input.content ?? '',
        kind: input.kind ?? 'nota',
        author: input.author ?? 'user',
        pinned: false,
        updatedAt: new Date().toISOString(),
      };
      docs.set(row.id, row);
      return row;
    },
    async getDocument(id: string) {
      return docs.get(id) ?? null;
    },
    async listDocuments(filter?: { projectId?: string }) {
      let list = [...docs.values()];
      if (filter?.projectId) list = list.filter((d) => d.projectId === filter.projectId);
      return list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    },
    async updateDocument(id: string, patch: DocumentPatch) {
      const cur = docs.get(id);
      if (!cur) throw new Error('updateDocument: no existe');
      const next: DocumentRow = {
        ...cur,
        title: patch.title ?? cur.title,
        content: patch.content === undefined ? cur.content : patch.content,
        pinned: patch.pinned === undefined ? cur.pinned : patch.pinned,
        updatedAt: new Date().toISOString(),
      };
      docs.set(id, next);
      return next;
    },
    async deleteDocument(id: string) {
      docs.delete(id);
    },
  };
}
