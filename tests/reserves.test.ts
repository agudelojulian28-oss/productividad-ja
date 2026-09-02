import { describe, it, expect } from 'vitest';
import {
  updateReserveFund,
  addFlujoAllocation,
  addEmergencyMovement,
  reserveView,
  mesesDeGastos,
} from '@/core/finance/reserves';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { ctx as makeCtx } from './fake-repo';
import type { SerieMes } from '@/core/finance/queries';

const ctx = makeCtx();

async function seededRepo() {
  const repo = makeFakeFinanceRepo();
  await repo.ensureReserves();
  return repo;
}

describe('reserveView', () => {
  it('bajo meta cuando saldo < meta', () => {
    const v = reserveView({ fundId: 'f', kind: 'emergencia', targetMinor: 1000, description: null, projectId: null, inMinor: 300, outMinor: 0, balanceMinor: 300, movements: 1 });
    expect(v.belowTarget).toBe(true);
    expect(v.remainingMinor).toBe(700);
  });
  it('no bajo meta cuando saldo >= meta o no hay meta', () => {
    expect(reserveView({ fundId: 'f', kind: 'flujo', targetMinor: 0, description: null, projectId: null, inMinor: 500, outMinor: 0, balanceMinor: 500, movements: 1 }).belowTarget).toBe(false);
    expect(reserveView({ fundId: 'f', kind: 'flujo', targetMinor: 500, description: null, projectId: null, inMinor: 500, outMinor: 0, balanceMinor: 500, movements: 1 }).belowTarget).toBe(false);
  });
});

describe('mesesDeGastos', () => {
  const serie: SerieMes[] = [
    { month: '2026-04-01', inflowMinor: 0, outflowMinor: 100_000, netMinor: -100_000 },
    { month: '2026-05-01', inflowMinor: 0, outflowMinor: 200_000, netMinor: -200_000 },
    { month: '2026-06-01', inflowMinor: 0, outflowMinor: 0, netMinor: 0 }, // sin gasto: se ignora
  ];
  it('promedio de gastos × n (ignora meses sin gasto)', () => {
    // promedio = (100k + 200k) / 2 = 150k; ×6 = 900k
    expect(mesesDeGastos(serie, 6)).toBe(900_000);
  });
  it('sin datos → 0', () => {
    expect(mesesDeGastos([], 6)).toBe(0);
  });
});

describe('addFlujoAllocation', () => {
  it('inserta un movimiento in y NO crea transacción', async () => {
    const repo = await seededRepo();
    const flujo = await repo.getReserveFund('flujo');
    const r = await addFlujoAllocation(ctx, repo, { fundId: flujo!.id, amountMinor: 50_000 });
    expect(r.ok).toBe(true);
    expect(repo._reserveMovements).toHaveLength(1);
    expect(repo._reserveMovements[0]!.direction).toBe('in');
    expect(repo._txs).toHaveLength(0); // el flujo no toca el balance
    const sum = (await repo.reserveSummary()).find((s) => s.kind === 'flujo');
    expect(sum!.balanceMinor).toBe(50_000);
  });
});

describe('addEmergencyMovement', () => {
  async function emergReady() {
    const repo = await seededRepo();
    const fund = await repo.getReserveFund('emergencia');
    // Proyecto/área dedicados (los asegura la acción; aquí a mano con uuids del fake).
    await repo.updateReserveFund(fund!.id, {
      projectId: '00000000-0000-4000-8000-000000000901',
      areaId: '00000000-0000-4000-8000-000000000902',
    });
    return { repo, fundId: fund!.id };
  }

  it('aportar (in) crea un GASTO del balance + movimiento ligado', async () => {
    const { repo, fundId } = await emergReady();
    const r = await addEmergencyMovement(ctx, repo, { fundId, direction: 'in', amountMinor: 300_000 });
    expect(r.ok).toBe(true);
    // Gasto real en el balance (transacción out).
    expect(repo._txs).toHaveLength(1);
    expect(repo._txs[0]!.direction).toBe('out');
    expect(repo._txs[0]!.baseAmountMinor).toBe(300_000);
    // Movimiento del fondo ligado a esa transacción.
    expect(repo._reserveMovements).toHaveLength(1);
    expect(repo._reserveMovements[0]!.direction).toBe('in');
    expect(repo._reserveMovements[0]!.linkedTransactionId).toBe(repo._txs[0]!.id);
  });

  it('retirar (out) solo baja el fondo, no toca el balance', async () => {
    const { repo, fundId } = await emergReady();
    await addEmergencyMovement(ctx, repo, { fundId, direction: 'in', amountMinor: 300_000 });
    const r = await addEmergencyMovement(ctx, repo, { fundId, direction: 'out', amountMinor: 100_000 });
    expect(r.ok).toBe(true);
    expect(repo._txs).toHaveLength(1); // sigue habiendo solo el gasto del aporte
    const sum = (await repo.reserveSummary()).find((s) => s.kind === 'emergencia');
    expect(sum!.balanceMinor).toBe(200_000); // 300k − 100k
    const out = repo._reserveMovements.find((m) => m.direction === 'out');
    expect(out!.linkedTransactionId).toBeNull();
  });

  it('aportar sin proyecto dedicado falla con RULE_VIOLATION', async () => {
    const repo = await seededRepo();
    const fund = await repo.getReserveFund('emergencia');
    const r = await addEmergencyMovement(ctx, repo, { fundId: fund!.id, direction: 'in', amountMinor: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RULE_VIOLATION');
  });
});

describe('updateReserveFund', () => {
  it('cambia la meta', async () => {
    const repo = await seededRepo();
    const flujo = await repo.getReserveFund('flujo');
    const r = await updateReserveFund(ctx, repo, { id: flujo!.id, targetMinor: 500_000 });
    expect(r.ok).toBe(true);
    expect((await repo.getReserveFund('flujo'))!.targetMinor).toBe(500_000);
  });
});
