import { describe, it, expect } from 'vitest';
import {
  monthlyEquivRecurring,
  recurringMonthly,
  recurringByProject,
  reporteFinanciero,
  type RecurItem,
} from '@/core/finance/analisis';
import type { SerieMes } from '@/core/finance/queries';

describe('monthlyEquivRecurring', () => {
  it('normaliza cada frecuencia a mensual', () => {
    expect(monthlyEquivRecurring(120_000, 'mensual')).toBe(120_000);
    expect(monthlyEquivRecurring(120_000, 'anual')).toBe(10_000);
    expect(monthlyEquivRecurring(100_000, 'quincenal')).toBe(200_000);
    expect(monthlyEquivRecurring(120_000, 'bimestral')).toBe(60_000);
    expect(monthlyEquivRecurring(120_000, 'trimestral')).toBe(40_000);
    expect(monthlyEquivRecurring(120_000, 'semanal')).toBe(520_000); // 120k × 52/12
  });
});

describe('recurringMonthly', () => {
  it('suma ingresos, gastos y neto mensual-equivalente', () => {
    const items: RecurItem[] = [
      { direction: 'in', projectId: 'p1', amountMinor: 1_000_000, frequency: 'mensual' },
      { direction: 'out', projectId: 'p1', amountMinor: 1_200_000, frequency: 'anual' }, // 100k/mes
      { direction: 'out', projectId: 'p2', amountMinor: 300_000, frequency: 'mensual' },
    ];
    const r = recurringMonthly(items);
    expect(r.inMinor).toBe(1_000_000);
    expect(r.outMinor).toBe(400_000);
    expect(r.netMinor).toBe(600_000);
  });
});

describe('recurringByProject', () => {
  it('agrupa por proyecto con subtotal, ordenado desc', () => {
    const items = [
      { id: 'a', label: 'x', direction: 'out' as const, projectId: 'p1', amountMinor: 100_000, frequency: 'mensual' as const },
      { id: 'b', label: 'y', direction: 'out' as const, projectId: 'p2', amountMinor: 500_000, frequency: 'mensual' as const },
      { id: 'c', label: 'z', direction: 'out' as const, projectId: 'p1', amountMinor: 50_000, frequency: 'mensual' as const },
    ];
    const g = recurringByProject(items);
    expect(g[0]!.projectId).toBe('p2'); // 500k > 150k
    expect(g[1]!.totalMonthlyMinor).toBe(150_000);
  });
});

describe('reporteFinanciero', () => {
  const serie: SerieMes[] = [
    { month: '2026-06-01', inflowMinor: 1_000_000, outflowMinor: 700_000, netMinor: 300_000 },
    { month: '2026-07-01', inflowMinor: 1_000_000, outflowMinor: 800_000, netMinor: 200_000 },
    { month: '2026-08-01', inflowMinor: 1_000_000, outflowMinor: 600_000, netMinor: 400_000 },
    { month: '2026-09-01', inflowMinor: 1_000_000, outflowMinor: 700_000, netMinor: 300_000 },
  ];
  const recurrentes: RecurItem[] = [{ direction: 'out', projectId: 'p', amountMinor: 350_000, frequency: 'mensual' }];

  it('calcula promedios, tasas y verdict', () => {
    const r = reporteFinanciero({ serie, recurrentes, emergencyBalanceMinor: 4_200_000, today: '2026-09-15' });
    expect(r.monthsUsed).toBe(4);
    expect(r.avgInMinor).toBe(1_000_000);
    expect(r.avgOutMinor).toBe(700_000);
    expect(r.avgNetMinor).toBe(300_000);
    expect(r.savingsRatePct).toBe(30);
    expect(r.fixedCostRatioPct).toBe(35);
    expect(r.emergencyCoverageMonths).toBe(6);
    expect(r.trend).toBe('mejora');
    expect(r.score).toBe(100);
    expect(r.verdict).toBe('sana');
  });

  it('proyecta los próximos 3 meses acumulando el neto promedio', () => {
    const r = reporteFinanciero({ serie, recurrentes, emergencyBalanceMinor: 0, today: '2026-09-15' });
    expect(r.projection).toHaveLength(3);
    expect(r.projection[0]!.month).toBe('2026-10');
    expect(r.projection[2]!.cumulativeMinor).toBe(900_000);
  });

  it('sin datos → informe vacío pero válido', () => {
    const r = reporteFinanciero({ serie: [], recurrentes: [], emergencyBalanceMinor: 0, today: '2026-09-15' });
    expect(r.monthsUsed).toBe(0);
    expect(r.savingsRatePct).toBeNull();
    expect(r.emergencyCoverageMonths).toBeNull();
    expect(r.projection).toHaveLength(3);
    expect(r.projection[0]!.cumulativeMinor).toBe(0);
  });
});
