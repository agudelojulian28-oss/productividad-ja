import { describe, it, expect } from 'vitest';
import {
  createDocument,
  appendToDocument,
  updateDocument,
  deleteDocument,
  listDocuments,
} from '@/core/structure/documents';
import { makeFakeStructureRepo } from './fake-structure-repo';
import { ctx } from './fake-repo';

const PROJ = '00000000-0000-4000-8000-0000000000cc';

describe('createDocument', () => {
  it('crea un documento global (autor user por defecto)', async () => {
    const repo = makeFakeStructureRepo();
    const r = await createDocument(ctx(), repo, { title: 'Cómo cotizo', kind: 'proceso' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.author).toBe('user');
      expect(r.value.projectId).toBeNull();
    }
  });

  it('el agente crea con autor agente', async () => {
    const repo = makeFakeStructureRepo();
    const r = await createDocument(
      ctx(),
      repo,
      { title: 'Preferencia', content: 'Cliente X prefiere Y', projectId: PROJ },
      'agente',
    );
    expect(r.ok && r.value.author).toBe('agente');
    expect(r.ok && r.value.projectId).toBe(PROJ);
  });

  it('rechaza título vacío', async () => {
    const repo = makeFakeStructureRepo();
    const r = await createDocument(ctx(), repo, { title: '  ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });
});

describe('appendToDocument', () => {
  it('anexa de forma aditiva con separador', async () => {
    const repo = makeFakeStructureRepo();
    const c = await createDocument(ctx(), repo, { title: 'Bitácora', content: 'Uno' });
    if (!c.ok) throw new Error('setup');
    const r = await appendToDocument(ctx(), repo, { id: c.value.id, content: 'Dos' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.content).toBe('Uno\n\nDos');
  });

  it('anexa a un doc vacío sin separador inicial', async () => {
    const repo = makeFakeStructureRepo();
    const c = await createDocument(ctx(), repo, { title: 'Vacío' });
    if (!c.ok) throw new Error('setup');
    const r = await appendToDocument(ctx(), repo, { id: c.value.id, content: 'Primera línea' });
    expect(r.ok && r.value.content).toBe('Primera línea');
  });

  it('NOT_FOUND si el doc no existe', async () => {
    const repo = makeFakeStructureRepo();
    const r = await appendToDocument(ctx(), repo, {
      id: '00000000-0000-4000-8000-000000000999',
      content: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });
});

describe('listDocuments / update / delete', () => {
  it('filtra por proyecto y prioriza pinned', async () => {
    const repo = makeFakeStructureRepo();
    await createDocument(ctx(), repo, { title: 'Global' });
    const p = await createDocument(ctx(), repo, { title: 'De proyecto', projectId: PROJ });
    if (!p.ok) throw new Error('setup');
    await updateDocument(ctx(), repo, p.value.id, { pinned: true });

    const all = await listDocuments(ctx(), repo);
    expect(all.ok && all.value.length).toBe(2);
    const delProy = await listDocuments(ctx(), repo, { projectId: PROJ });
    expect(delProy.ok && delProy.value.length).toBe(1);
    expect(delProy.ok && delProy.value[0]!.pinned).toBe(true);
  });

  it('borra un documento', async () => {
    const repo = makeFakeStructureRepo();
    const c = await createDocument(ctx(), repo, { title: 'Temporal' });
    if (!c.ok) throw new Error('setup');
    const r = await deleteDocument(ctx(), repo, c.value.id);
    expect(r.ok).toBe(true);
    const all = await listDocuments(ctx(), repo);
    expect(all.ok && all.value.length).toBe(0);
  });
});
