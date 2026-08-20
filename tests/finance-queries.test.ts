import { describe, it, expect } from 'vitest';
import {
  resumenFinanciero,
  resumenPorPeriodo,
  enPeriodo,
  serieMensual,
  topGastos,
  mesActual,
} from '@/core/finance/queries';
import type { CashflowMonthRow, ExpenseCategoryRow } from '@/core/finance/ports';

const TZ = 'America/Bogota';
const NOW = new Date('2026-07-29T15:00:00-05:00');

function cf(over: Partial<CashflowMonthRow>): CashflowMonthRow {
  return {
    areaId: 'a',
    month: '2026-07-01',
    inflowMinor: 0,
    outflowMinor: 0,
    netMinor: 0,
    movements: 0,
    lastRecordedAt: null,
    ...over,
  };
}

describe('mesActual', () => {
  it('da YYYY-MM en la zona del usuario', () => {
    expect(mesActual(TZ, NOW)).toBe('2026-07');
  });
});

describe('resumenFinanciero', () => {
  it('suma entradas/salidas del mes actual across áreas', () => {
    const rows = [
      cf({ areaId: 'a', inflowMinor: 100, outflowMinor: 40, movements: 2 }),
      cf({ areaId: 'b', inflowMinor: 21, outflowMinor: 38, movements: 1 }),
      cf({ month: '2026-06-01', inflowMinor: 999, outflowMinor: 999 }), // otro mes
    ];
    const r = resumenFinanciero(rows, TZ, NOW);
    expect(r.inflowMinor).toBe(121);
    expect(r.outflowMinor).toBe(78);
    expect(r.netMinor).toBe(43);
    expect(r.movements).toBe(3);
  });

  it('marca stale si el último movimiento tiene > 3 días', () => {
    const rows = [cf({ lastRecordedAt: '2026-07-20T10:00:00Z' })]; // 9 días antes
    const r = resumenFinanciero(rows, TZ, NOW);
    expect(r.stale).toBe(true);
    expect(r.staleDays).toBeGreaterThan(3);
  });

  it('no stale si es reciente', () => {
    const rows = [cf({ lastRecordedAt: '2026-07-29T10:00:00Z' })];
    const r = resumenFinanciero(rows, TZ, NOW);
    expect(r.stale).toBe(false);
  });

  it('sin movimientos: stale null, cifras en cero', () => {
    const r = resumenFinanciero([], TZ, NOW);
    expect(r.netMinor).toBe(0);
    expect(r.lastRecordedAt).toBeNull();
    expect(r.stale).toBe(false);
  });
});

describe('resumenPorPeriodo', () => {
  const rows = [
    cf({ month: '2026-07-01', inflowMinor: 100, outflowMinor: 40, movements: 2 }), // este mes
    cf({ month: '2026-06-01', inflowMinor: 50, outflowMinor: 10, movements: 1 }), // mes pasado
    cf({ month: '2026-01-01', inflowMinor: 7, outflowMinor: 3, movements: 1 }), // este año
    cf({ month: '2025-12-01', inflowMinor: 999, outflowMinor: 1, movements: 5 }), // año pasado
  ];

  it('mes = solo el mes actual', () => {
    const r = resumenPorPeriodo(rows, TZ, 'mes', NOW);
    expect(r.netMinor).toBe(60);
    expect(r.movements).toBe(2);
    expect(r.etiqueta).toBe('este mes');
  });

  it('mes_pasado = solo el mes anterior', () => {
    const r = resumenPorPeriodo(rows, TZ, 'mes_pasado', NOW);
    expect(r.inflowMinor).toBe(50);
    expect(r.netMinor).toBe(40);
  });

  it('anio = todos los meses del año en curso', () => {
    const r = resumenPorPeriodo(rows, TZ, 'anio', NOW);
    expect(r.inflowMinor).toBe(157); // 100 + 50 + 7
    expect(r.movements).toBe(4);
  });

  it('todo = histórico completo', () => {
    const r = resumenPorPeriodo(rows, TZ, 'todo', NOW);
    expect(r.inflowMinor).toBe(1156);
    expect(r.movements).toBe(9);
  });

  it('enPeriodo distingue el mes actual del pasado', () => {
    expect(enPeriodo('2026-07-01', 'mes', TZ, NOW)).toBe(true);
    expect(enPeriodo('2026-06-01', 'mes', TZ, NOW)).toBe(false);
    expect(enPeriodo('2026-06-01', 'mes_pasado', TZ, NOW)).toBe(true);
    expect(enPeriodo('2025-12-01', 'anio', TZ, NOW)).toBe(false);
    expect(enPeriodo('2025-12-01', 'todo', TZ, NOW)).toBe(true);
  });
});

describe('serieMensual', () => {
  it('agrega por mes y toma los últimos N ordenados', () => {
    const rows = [
      cf({ month: '2026-05-01', netMinor: 10, inflowMinor: 10 }),
      cf({ month: '2026-05-01', netMinor: 5, inflowMinor: 5 }),
      cf({ month: '2026-07-01', netMinor: 3, inflowMinor: 3 }),
    ];
    const s = serieMensual(rows, 6);
    expect(s.length).toBe(2);
    expect(s[0]!.month).toBe('2026-05-01');
    expect(s[0]!.netMinor).toBe(15);
  });
});

describe('topGastos', () => {
  function ex(over: Partial<ExpenseCategoryRow>): ExpenseCategoryRow {
    return { areaId: 'a', month: '2026-07-01', category: 'x', amountMinor: 0, movements: 1, ...over };
  }
  it('top-N del mes ordenado desc', () => {
    const rows = [
      ex({ category: 'nómina', amountMinor: 400 }),
      ex({ category: 'software', amountMinor: 90 }),
      ex({ category: 'nómina', amountMinor: 100 }), // se suma → 500
      ex({ month: '2026-06-01', category: 'viejo', amountMinor: 9999 }),
    ];
    const top = topGastos(rows, TZ, 5, NOW);
    expect(top[0]).toEqual({ category: 'nómina', amountMinor: 500 });
    expect(top[1]).toEqual({ category: 'software', amountMinor: 90 });
    expect(top.length).toBe(2);
  });
});
