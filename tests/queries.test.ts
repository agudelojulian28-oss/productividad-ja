import { describe, it, expect } from 'vitest';
import { consultar, buscar } from '@/core/work/queries';
import { createTask } from '@/core/work/tasks';
import { makeFakeRepo, ctx } from './fake-repo';

describe('consultar', () => {
  it('pendientes devuelve todas las tareas pendientes', async () => {
    const repo = makeFakeRepo();
    await createTask(ctx(), repo, { title: 'a' });
    await createTask(ctx(), repo, { title: 'b' });
    const r = await consultar(ctx(), repo, 'pendientes');
    expect(r.ok && r.value.length).toBe(2);
  });

  it('agenda_hoy filtra a las de hoy en la zona del usuario', async () => {
    const repo = makeFakeRepo();
    const tz = 'America/Bogota';
    const hoy = new Date().toISOString();
    const enUnaSemana = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await createTask(ctx({ tz }), repo, { title: 'hoy', dueAt: hoy });
    await createTask(ctx({ tz }), repo, { title: 'futuro', dueAt: enUnaSemana });
    const r = await consultar(ctx({ tz }), repo, 'agenda_hoy');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const titles = r.value.map((t) => t.title);
      expect(titles).toContain('hoy');
      expect(titles).not.toContain('futuro');
    }
  });
});

describe('buscar', () => {
  it('encuentra por texto en el título (sin distinguir mayúsculas)', async () => {
    const repo = makeFakeRepo();
    await createTask(ctx(), repo, { title: 'Comprar café' });
    await createTask(ctx(), repo, { title: 'Llamar al banco' });
    const r = await buscar(ctx(), repo, 'CAFÉ');
    expect(r.ok && r.value.length).toBe(1);
    expect(r.ok && r.value[0]?.title).toBe('Comprar café');
  });
});
