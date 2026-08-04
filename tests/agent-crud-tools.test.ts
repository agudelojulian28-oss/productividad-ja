import { describe, it, expect } from 'vitest';
import { runTool, type ToolDeps } from '@/agent/tools';
import { makeFakeRepo, ctx } from './fake-repo';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { makeFakeStructureRepo } from './fake-structure-repo';

const AREA = '00000000-0000-4000-8000-0000000000aa';

function deps(): ToolDeps & {
  repo: ReturnType<typeof makeFakeRepo>;
  fin: ReturnType<typeof makeFakeFinanceRepo>;
  st: ReturnType<typeof makeFakeStructureRepo>;
} {
  const repo = makeFakeRepo();
  const fin = makeFakeFinanceRepo();
  const st = makeFakeStructureRepo();
  return { ctx: ctx(), repo, finance: fin, structure: st, fin, st };
}

describe('runTool · crear (verbos generales)', () => {
  it('crea área', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'area', titulo: 'Personal', clase: 'personal' });
    expect(r.ok).toBe(true);
    expect((await d.st.listAreas()).length).toBe(1);
  });

  it('crea proyecto en un área', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'proyecto', titulo: 'Web', area_id: AREA });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { proyecto_id: string }).proyecto_id).toBeTruthy();
  });

  it('crea meta bajo un proyecto (con factores)', async () => {
    const d = deps();
    const p = await d.repo.insertProject({ title: 'P', areaId: AREA });
    const r = await runTool(d, 'crear', {
      tipo: 'meta',
      titulo: 'Lanzar v1',
      proyecto_id: p.id,
      objetivo: 10,
      hasta: '2026-12-31',
    });
    expect(r.ok).toBe(true);
  });

  it('crea fuente de ingreso', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', {
      tipo: 'fuente',
      titulo: 'Consultoría',
      area_id: AREA,
      modelo: 'servicio',
    });
    expect(r.ok).toBe(true);
    expect((await d.fin.listIncomeSources()).length).toBe(1);
  });

  it('crea meta de dinero bajo un proyecto', async () => {
    const d = deps();
    const p = await d.repo.insertProject({ title: 'P', areaId: AREA });
    const r = await runTool(d, 'crear', {
      tipo: 'meta_dinero',
      titulo: 'Ingresos julio',
      metrica: 'money_in',
      objetivo: 20_000_000,
      proyecto_id: p.id,
      desde: '2026-07-01',
      hasta: '2026-07-31',
    });
    expect(r.ok).toBe(true);
  });

  it('crea tarea', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'tarea', titulo: 'Llamar al banco' });
    expect(r.ok).toBe(true);
  });

  it('rechaza proyecto sin área (refine)', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'proyecto', titulo: 'X' });
    expect(r.ok).toBe(false);
  });
});

describe('runTool · actualizar / archivar', () => {
  it('completa una tarea', async () => {
    const d = deps();
    const t = await d.repo.insertTask({ title: 'T', origin: 'manual' });
    const r = await runTool(d, 'actualizar', { tipo: 'tarea', id: t.id, accion: 'completar' });
    expect(r.ok).toBe(true);
    expect((await d.repo.getTask(t.id))!.status).toBe('done');
  });

  it('mueve una tarea a otro proyecto', async () => {
    const d = deps();
    const t = await d.repo.insertTask({ title: 'T', origin: 'manual' });
    const p = await d.repo.insertProject({ title: 'Destino', areaId: AREA });
    const r = await runTool(d, 'actualizar', { tipo: 'tarea', id: t.id, accion: 'mover', proyecto_id: p.id });
    expect(r.ok).toBe(true);
    expect((await d.repo.getTask(t.id))!.projectId).toBe(p.id);
  });

  it('cambia los factores de una meta', async () => {
    const d = deps();
    const p = await d.repo.insertProject({ title: 'P', areaId: AREA });
    const g = await d.repo.insertGoal({ projectId: p.id, title: 'M', tz: 'America/Bogota' });
    const r = await runTool(d, 'actualizar', { tipo: 'meta', id: g.id, accion: 'factores', objetivo: 5 });
    expect(r.ok).toBe(true);
    expect((await d.repo.getGoal(g.id))!.targetValue).toBe(5);
  });

  it('edita la descripción de un área', async () => {
    const d = deps();
    const a = await d.st.insertArea({ name: 'A', kind: 'negocio' });
    const r = await runTool(d, 'actualizar', { tipo: 'area', id: a.id, accion: 'descripcion', descripcion: 'hola' });
    expect(r.ok).toBe(true);
  });

  it('archiva una tarea (borra)', async () => {
    const d = deps();
    const t = await d.repo.insertTask({ title: 'T', origin: 'manual' });
    const r = await runTool(d, 'archivar', { tipo: 'tarea', id: t.id });
    expect(r.ok).toBe(true);
    expect(await d.repo.getTask(t.id)).toBeNull();
  });

  it('archiva una fuente', async () => {
    const d = deps();
    const s = await d.fin.insertIncomeSource({ areaId: AREA, name: 'C', model: 'servicio' });
    const r = await runTool(d, 'archivar', { tipo: 'fuente', id: s.id });
    expect(r.ok).toBe(true);
    expect((await d.fin.listIncomeSources()).length).toBe(0);
  });
});
