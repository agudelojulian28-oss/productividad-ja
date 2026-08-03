import { describe, it, expect } from 'vitest';
import { runTool, type ToolDeps } from '@/agent/tools';
import { makeFakeRepo, ctx } from './fake-repo';
import { makeFakeStructureRepo } from './fake-structure-repo';

const PROJ = '00000000-0000-4000-8000-0000000000cc';

function deps(): ToolDeps & { st: ReturnType<typeof makeFakeStructureRepo> } {
  const st = makeFakeStructureRepo();
  return { ctx: ctx(), repo: makeFakeRepo(), structure: st, st };
}

describe('runTool · crear documento', () => {
  it('crea un documento con autor agente', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', {
      tipo: 'documento',
      titulo: 'Preferencia de informes',
      contenido: 'Los informes van los viernes.',
      clase_doc: 'preferencia',
      proyecto_id: PROJ,
    });
    expect(r.ok).toBe(true);
    expect(d.st._docs.size).toBe(1);
    const doc = [...d.st._docs.values()][0]!;
    expect(doc.author).toBe('agente');
    expect(doc.projectId).toBe(PROJ);
  });

  it('anexa a un documento existente (aditivo)', async () => {
    const d = deps();
    const created = await runTool(d, 'crear', { tipo: 'documento', titulo: 'Bitácora', contenido: 'Uno' });
    if (!created.ok) throw new Error('setup');
    const docId = (created.value as { documento_id: string }).documento_id;
    const r = await runTool(d, 'actualizar', { tipo: 'documento', id: docId, accion: 'anexar', descripcion: 'Dos' });
    expect(r.ok).toBe(true);
    expect(d.st._docs.get(docId)!.content).toBe('Uno\n\nDos');
  });

  it('crear sin título → error (schema)', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'documento', contenido: 'x' });
    expect(r.ok).toBe(false);
  });

  it('anexar sin id → error (schema)', async () => {
    const d = deps();
    const r = await runTool(d, 'actualizar', { tipo: 'documento', accion: 'anexar', descripcion: 'x' });
    expect(r.ok).toBe(false);
  });
});

describe('runTool · consultar documentacion', () => {
  it('lista documentos, filtrando por proyecto', async () => {
    const d = deps();
    await runTool(d, 'crear', { tipo: 'documento', titulo: 'Global', contenido: 'g' });
    await runTool(d, 'crear', { tipo: 'documento', titulo: 'De proyecto', contenido: 'p', proyecto_id: PROJ });
    const all = await runTool(d, 'consultar', { vista: 'documentacion' });
    expect(all.ok && (all.value as unknown[]).length).toBe(2);
    const delProy = await runTool(d, 'consultar', { vista: 'documentacion', proyecto_id: PROJ });
    expect(delProy.ok && (delProy.value as unknown[]).length).toBe(1);
    if (delProy.ok) {
      expect((delProy.value as { titulo: string }[])[0]!.titulo).toBe('De proyecto');
    }
  });
});
