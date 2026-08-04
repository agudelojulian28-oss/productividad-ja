// Structure repo en memoria para probar documentos sin base de datos.
import type {
  StructureRepo,
  AreaRow,
  AreaKind,
  DocumentRow,
  DocumentInsert,
  DocumentPatch,
  AttachmentRow,
} from '@/core/structure/ports';

export function makeFakeStructureRepo(): StructureRepo & {
  _docs: Map<string, DocumentRow>;
  _attachments: Map<string, AttachmentRow>;
} {
  const areas = new Map<string, AreaRow>();
  const docs = new Map<string, DocumentRow>();
  const attachments = new Map<string, AttachmentRow>();
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    _docs: docs,
    _attachments: attachments,
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

    async insertAttachment(input: {
      storagePath: string;
      mime: string;
      transactionId?: string;
      projectId?: string;
      description?: string;
      saved?: boolean;
    }) {
      const row: AttachmentRow = {
        id: uuid(),
        storagePath: input.storagePath,
        mime: input.mime,
        projectId: input.projectId ?? null,
        transactionId: input.transactionId ?? null,
        description: input.description ?? null,
        saved: input.saved ?? false,
        createdAt: new Date().toISOString(),
      };
      attachments.set(row.id, row);
      return row;
    },
    async getAttachment(id: string) {
      return attachments.get(id) ?? null;
    },
    async updateAttachment(
      id: string,
      patch: {
        saved?: boolean;
        projectId?: string | null;
        transactionId?: string | null;
        description?: string | null;
      },
    ) {
      const cur = attachments.get(id);
      if (!cur) throw new Error('updateAttachment: no existe');
      const next: AttachmentRow = {
        ...cur,
        saved: patch.saved === undefined ? cur.saved : patch.saved,
        projectId: patch.projectId === undefined ? cur.projectId : patch.projectId,
        transactionId:
          patch.transactionId === undefined ? cur.transactionId : patch.transactionId,
        description: patch.description === undefined ? cur.description : patch.description,
      };
      attachments.set(id, next);
      return next;
    },
    async listSavedAttachments(projectId: string) {
      return [...attachments.values()].filter((a) => a.saved && a.projectId === projectId);
    },
    async listAttachmentsByTransaction(transactionId: string) {
      return [...attachments.values()].filter((a) => a.transactionId === transactionId);
    },
    async listAttachmentsForTransactions(transactionIds: string[]) {
      const set = new Set(transactionIds);
      return [...attachments.values()].filter((a) => a.transactionId && set.has(a.transactionId));
    },
  };
}
