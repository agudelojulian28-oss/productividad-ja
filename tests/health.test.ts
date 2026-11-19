import { describe, it, expect } from 'vitest';
import {
  isoWeekday,
  routineForDay,
  weekSchedule,
  checklistForDay,
  streak,
  weekCompletionPct,
  groceryMonthlyMinor,
  childrenOf,
} from '@/core/health/plan';
import { createHealthItem, updateHealthItem, deleteHealthItem, setHealthCheckin } from '@/core/health/items';
import { createGrocery } from '@/core/health/groceries';
import { seedHealthPlan, SEED_PLAN } from '@/core/health/seed';
import { makeFakeHealthRepo } from './fake-health-repo';
import { ctx as makeCtx } from './fake-repo';

const ctx = makeCtx();
// 2026-11-16 es lunes; 2026-11-19 jueves; 2026-11-22 domingo.
const LUN = '2026-11-16';
const MAR = '2026-11-17';
const MIE = '2026-11-18';
const DOM = '2026-11-22';

async function seeded() {
  const repo = makeFakeHealthRepo();
  await seedHealthPlan(ctx, repo);
  return repo;
}

describe('plan · días y rutinas', () => {
  it('isoWeekday: lunes=1 … domingo=7', () => {
    expect(isoWeekday(LUN)).toBe(1);
    expect(isoWeekday('2026-11-19')).toBe(4);
    expect(isoWeekday(DOM)).toBe(7);
  });

  it('semana precargada: L A1 · M B · Mi A2 · J B · V A1 · S B · D descanso', async () => {
    const repo = await seeded();
    const items = await repo.listItems();
    const corto = weekSchedule(items).map((r) => (r ? r.title.split('·')[0]!.trim() : null));
    expect(corto).toEqual(['A1', 'B', 'A2', 'B', 'A1', 'B', null]);
    expect(routineForDay(items, LUN)?.title).toMatch(/^A1/);
    expect(routineForDay(items, MIE)?.title).toMatch(/^A2/);
    expect(routineForDay(items, DOM)).toBeNull();
  });

  it('la rutina trae sus ejercicios y la hora dorada suma ~30 min', async () => {
    const repo = await seeded();
    const items = await repo.listItems();
    const a1 = routineForDay(items, LUN)!;
    expect(childrenOf(items, a1.id).length).toBe(6);
    const hd = items.find((i) => i.title === 'Hora dorada')!;
    expect(childrenOf(items, hd.id).reduce((s, k) => s + (k.durationMin ?? 0), 0)).toBe(30);
  });
});

describe('plan · checklist, racha y semana', () => {
  it('checklist: el domingo trae la preparación de comida y no hay rutina', async () => {
    const repo = await seeded();
    const items = await repo.listItems();
    const dom = checklistForDay(items, DOM).map((i) => i.title);
    expect(dom).toContain('Preparar comida (domingo)');
    expect(dom.some((t) => /^A1|^A2|^B/.test(t))).toBe(false);
    const lun = checklistForDay(items, LUN).map((i) => i.title);
    expect(lun.some((t) => t.startsWith('A1'))).toBe(true);
    expect(lun).toContain('Hora dorada');
  });

  it('racha = días seguidos al 100% (hoy incompleto cuenta desde ayer)', async () => {
    const repo = await seeded();
    const items = await repo.listItems();
    for (const day of [LUN, MAR]) {
      for (const i of checklistForDay(items, day)) await repo.setCheckin(i.id, day, true);
    }
    const ck = await repo.listCheckins('2026-01-01', '2026-12-31');
    expect(streak(items, ck, MAR)).toBe(2); // lunes y martes completos
    expect(streak(items, ck, MIE)).toBe(2); // miércoles en curso: cuenta desde ayer
    expect(weekCompletionPct(items, ck, MAR)).toBeGreaterThan(0);
  });

  it('mercado: total mensual-equivalente', () => {
    const g = (costMinor: number, frequency: 'semanal' | 'mensual') => ({
      id: 'x', name: 'x', quantity: null, costMinor, frequency, checked: false, sortOrder: 0, active: true,
    });
    // 100.000 semanal ≈ 433.333/mes + 50.000 mensual
    expect(groceryMonthlyMinor([g(100_000, 'semanal'), g(50_000, 'mensual')])).toBe(483_333);
  });
});

describe('casos de uso de salud', () => {
  it('un ejercicio sin rutina (o bajo algo que no es rutina) se rechaza', async () => {
    const repo = await seeded();
    const suelto = await createHealthItem(ctx, repo, { section: 'entrenamiento', kind: 'ejercicio', title: 'Sentadilla' });
    expect(suelto.ok).toBe(false);
    if (!suelto.ok) expect(suelto.code).toBe('RULE_VIOLATION');
    const comida = (await repo.listItems()).find((i) => i.kind === 'comida')!;
    const malPadre = await createHealthItem(ctx, repo, {
      section: 'dieta', kind: 'ejercicio', title: 'x', parentId: comida.id,
    });
    expect(malPadre.ok).toBe(false);
  });

  it('valida días (1..7) y nombre', async () => {
    const repo = makeFakeHealthRepo();
    const r1 = await createHealthItem(ctx, repo, { section: 'cuerpo', kind: 'habito', title: 'Agua', weekdays: [8] });
    expect(r1.ok).toBe(false);
    const r2 = await createHealthItem(ctx, repo, { section: 'cuerpo', kind: 'habito', title: '  ' });
    expect(r2.ok).toBe(false);
    const ok = await createHealthItem(ctx, repo, { section: 'cuerpo', kind: 'habito', title: 'Agua', weekdays: [1, 3, 5], trackable: true });
    expect(ok.ok).toBe(true);
  });

  it('check-in: solo con seguimiento, e idempotente', async () => {
    const repo = await seeded();
    const items = await repo.listItems();
    const compromiso = items.find((i) => i.kind === 'compromiso')!;
    const no = await setHealthCheckin(ctx, repo, { itemId: compromiso.id, day: LUN, done: true });
    expect(no.ok).toBe(false);
    const hd = items.find((i) => i.title === 'Hora dorada')!;
    await setHealthCheckin(ctx, repo, { itemId: hd.id, day: LUN, done: true });
    await setHealthCheckin(ctx, repo, { itemId: hd.id, day: LUN, done: true });
    expect(repo._checkins.filter((c) => c.itemId === hd.id).length).toBe(1);
    await setHealthCheckin(ctx, repo, { itemId: hd.id, day: LUN, done: false });
    expect(repo._checkins.length).toBe(0);
  });

  it('editar quita la marca "revisar" y borrar una rutina borra sus ejercicios', async () => {
    const repo = await seeded();
    const mino = (await repo.listItems()).find((i) => i.title === 'Minoxidil')!;
    expect(mino.needsReview).toBe(true);
    const u = await updateHealthItem(ctx, repo, { id: mino.id, detail: '2 al día', needsReview: false });
    expect(u.ok && u.value.needsReview).toBe(false);

    const a2 = (await repo.listItems()).find((i) => i.title.startsWith('A2'))!;
    const kids = childrenOf(await repo.listItems(), a2.id).length;
    expect(kids).toBeGreaterThan(0);
    await deleteHealthItem(ctx, repo, a2.id);
    expect(childrenOf(await repo.listItems(), a2.id).length).toBe(0);
  });

  it('la precarga es idempotente (no duplica)', async () => {
    const repo = await seeded();
    const n = (await repo.listItems()).length;
    const again = await seedHealthPlan(ctx, repo);
    expect(again.ok && again.value.seeded).toBe(false);
    expect((await repo.listItems()).length).toBe(n);
    const raices = SEED_PLAN.length;
    expect((await repo.listItems()).filter((i) => !i.parentId).length).toBe(raices);
  });

  it('dos precargas simultáneas (Hoy + Salud) no duplican el plan', async () => {
    const repo = makeFakeHealthRepo();
    await Promise.all([seedHealthPlan(ctx, repo), seedHealthPlan(ctx, repo)]);
    expect((await repo.listItems()).filter((i) => !i.parentId).length).toBe(SEED_PLAN.length);
  });

  it('mercado: nombre obligatorio y precio no negativo', async () => {
    const repo = makeFakeHealthRepo();
    expect((await createGrocery(ctx, repo, { name: '' })).ok).toBe(false);
    expect((await createGrocery(ctx, repo, { name: 'Huevos', costMinor: -1 })).ok).toBe(false);
    expect((await createGrocery(ctx, repo, { name: 'Huevos', costMinor: 1_800_000 })).ok).toBe(true);
  });
});
