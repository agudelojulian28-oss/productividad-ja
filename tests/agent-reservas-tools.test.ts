import { describe, it, expect } from 'vitest';
import { runTool, type ToolDeps } from '@/agent/tools';
import { makeFakeRepo, ctx } from './fake-repo';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { makeFakeStructureRepo } from './fake-structure-repo';

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

describe('runTool · reservas (agente)', () => {
  it('flujo: apartar es un movimiento in y NO crea transacción', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'reserva', fondo: 'flujo', direccion: 'ingreso', monto: 100_000 });
    expect(r.ok).toBe(true);
    expect(d.fin._reserveMovements.filter((m) => m.direction === 'in')).toHaveLength(1);
    expect(d.fin._txs).toHaveLength(0);
  });

  it('flujo: retirar (gasto) se rechaza', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'reserva', fondo: 'flujo', direccion: 'gasto', monto: 100_000 });
    expect(r.ok).toBe(false);
  });

  it('emergencia: aportar crea el proyecto dedicado + un GASTO del balance', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'reserva', fondo: 'emergencia', direccion: 'ingreso', monto: 300_000 });
    expect(r.ok).toBe(true);
    // Se creó área "Reservas" + proyecto "Fondo de emergencia".
    expect((await d.st.listAreas()).some((a) => a.name === 'Reservas')).toBe(true);
    // Gasto real del balance + movimiento del fondo ligado.
    expect(d.fin._txs).toHaveLength(1);
    expect(d.fin._txs[0]!.direction).toBe('out');
    const inMov = d.fin._reserveMovements.find((m) => m.direction === 'in');
    expect(inMov!.linkedTransactionId).toBe(d.fin._txs[0]!.id);
  });

  it('emergencia: retirar SIN confirmar pide confirmación y no mueve nada', async () => {
    const d = deps();
    const r = await runTool(d, 'crear', { tipo: 'reserva', fondo: 'emergencia', direccion: 'gasto', monto: 50_000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { confirmacion_requerida?: boolean }).confirmacion_requerida).toBe(true);
    expect(d.fin._reserveMovements).toHaveLength(0);
  });

  it('emergencia: retirar CON confirmar baja el fondo, sin tocar el balance', async () => {
    const d = deps();
    await runTool(d, 'crear', { tipo: 'reserva', fondo: 'emergencia', direccion: 'ingreso', monto: 300_000 });
    const txsBefore = d.fin._txs.length;
    const r = await runTool(d, 'crear', { tipo: 'reserva', fondo: 'emergencia', direccion: 'gasto', monto: 100_000, confirmar: true });
    expect(r.ok).toBe(true);
    expect(d.fin._txs.length).toBe(txsBefore); // el retiro no crea transacción
    const sum = (await d.fin.reserveSummary()).find((s) => s.kind === 'emergencia');
    expect(sum!.balanceMinor).toBe(20_000_000); // (300k − 100k pesos) × 100
  });

  it('actualizar reserva fija la meta', async () => {
    const d = deps();
    const r = await runTool(d, 'actualizar', { tipo: 'reserva', fondo: 'flujo', objetivo: 500_000 });
    expect(r.ok).toBe(true);
    expect((await d.fin.getReserveFund('flujo'))!.targetMinor).toBe(50_000_000);
  });

  it('consultar informe devuelve veredicto y score', async () => {
    const d = deps();
    const r = await runTool(d, 'consultar', { vista: 'informe' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { veredicto: string; score: number; proyeccion: unknown[] };
      expect(['sana', 'atencion', 'riesgo']).toContain(v.veredicto);
      expect(typeof v.score).toBe('number');
      expect(v.proyeccion.length).toBe(3);
    }
  });
});
