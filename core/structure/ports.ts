export type AreaKind = 'negocio' | 'personal';

export interface AreaRow {
  id: string;
  name: string;
  kind: AreaKind;
  position: number;
  description: string | null;
  archivedAt: string | null;
}

export interface StructureRepo {
  listAreas(includeArchived?: boolean): Promise<AreaRow[]>;
  getArea(id: string): Promise<AreaRow | null>;
  insertArea(input: { name: string; kind: AreaKind }): Promise<AreaRow>;
  updateArea(
    id: string,
    patch: { name?: string; description?: string | null; archivedAt?: string | null },
  ): Promise<AreaRow>;
}
