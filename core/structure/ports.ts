export type AreaKind = 'negocio' | 'personal';

export interface AreaRow {
  id: string;
  name: string;
  kind: AreaKind;
  position: number;
  description: string | null;
  archivedAt: string | null;
}

export type DocumentKind = 'proceso' | 'preferencia' | 'nota';
export type DocumentAuthor = 'user' | 'agente';

export interface DocumentRow {
  id: string;
  areaId: string | null;
  projectId: string | null;
  title: string;
  content: string;
  kind: DocumentKind;
  author: DocumentAuthor;
  pinned: boolean;
  updatedAt: string;
}

export interface DocumentInsert {
  areaId?: string;
  projectId?: string;
  title: string;
  content?: string;
  kind?: DocumentKind;
  author?: DocumentAuthor;
}

export interface DocumentPatch {
  title?: string;
  content?: string;
  pinned?: boolean;
}

export interface AttachmentRow {
  id: string;
  storagePath: string;
  mime: string;
  projectId: string | null;
  description: string | null;
  saved: boolean;
  createdAt: string;
}

export interface StructureRepo {
  listAreas(includeArchived?: boolean): Promise<AreaRow[]>;
  getArea(id: string): Promise<AreaRow | null>;
  insertArea(input: { name: string; kind: AreaKind }): Promise<AreaRow>;
  updateArea(
    id: string,
    patch: { name?: string; description?: string | null; archivedAt?: string | null },
  ): Promise<AreaRow>;

  insertDocument(input: DocumentInsert): Promise<DocumentRow>;
  getDocument(id: string): Promise<DocumentRow | null>;
  listDocuments(filter?: { projectId?: string }): Promise<DocumentRow[]>;
  updateDocument(id: string, patch: DocumentPatch): Promise<DocumentRow>;
  deleteDocument(id: string): Promise<void>;

  insertAttachment(input: { storagePath: string; mime: string }): Promise<AttachmentRow>;
  getAttachment(id: string): Promise<AttachmentRow | null>;
  updateAttachment(
    id: string,
    patch: { saved?: boolean; projectId?: string | null; description?: string | null },
  ): Promise<AttachmentRow>;
  listSavedAttachments(projectId: string): Promise<AttachmentRow[]>;
}
