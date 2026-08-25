import { describe, it, expect } from 'vitest';
import {
  createSustaining,
  deleteSustaining,
  monthlyEquivalent,
  sustainingSummary,
} from '@/core/finance/sustaining';
import { makeFakeFinanceRepo } from './fake-finance-repo';
import { ctx as makeCtx } from './fake-repo';
import type { SustainingServiceRow } from '@/core/finance/ports';

const ctx = makeCtx();

function svc(over: Partial<SustainingServiceRow>): SustainingServiceRow {
  return {
    id: over.id ?? 'x',
    name: over.name ?? 'Servicio',
    provider: over.provider ?? null,
    category: over.category ?? 'otro',
    status: over.status ?? 'paga',
    cadence: over.cadence ?? 'mensual',
    currency: over.currency ?? 'COP',
    amountMinor: over.amountMinor ?? 0,
    balanceMinor: over.balanceMinor ?? null,
    alertThresholdMinor: over.alertThresholdMinor ?? null,
    renewsOn: over.renewsOn ?? null,
    active: over.active ?? true,
    notes: over.notes ?? null,
  };
}

describe('monthlyEquivalent', () => {
  it('convierte por cadencia', () => {
    expect(monthlyEquivalent(12000, 'mensual')).toBe(12000);
    expect(monthlyEquivalent(120000, 'anual')).toBe(10000);
    expect(monthlyEquivalent(5000, 'uso')).toBe(5000);
    expect(monthlyEquivalent(999, 'unico')).toBe(0);
  });
});

describe('sustainingSummary', () => {
  const today = '2026-08-24';
  const TRM = 4000; // COP por 1 USD
  const services = [
    svc({ id: 'a', status: 'paga', cadence: 'mensual', amountMinor: 40000 }),
    svc({ id: 'b', status: 'paga', cadence: 'anual', amountMinor: 120000 }), // 10000/mes
    svc({ id: 'c', status: 'futuro', cadence: 'mensual', amountMinor: 100000 }),
    svc({ id: 'd', status: 'gratis', cadence: 'uso', amountMinor: 0 }),
    svc({ id: 'e', status: 'paga', cadence: 'mensual', amountMinor: 99999, active: false }), // inactiva
  ];

  it('suma solo las pagas activas (mensual-equivalente)', () => {
    const s = sustainingSummary(services, today, TRM);
    expect(s.monthlyTotalMinor).toBe(50000); // 40000 + 10000
    expect(s.futurosMinor).toBe(100000);
    expect(s.count).toBe(4); // excluye la inactiva
  });

  it('convierte los servicios en USD a COP con la TRM', () => {
    // US$20/mes → 2000 (centavos USD) × 4000 = 8.000.000 (centavos COP) = $80.000
    const s = sustainingSummary(
      [svc({ id: 'u', status: 'paga', cadence: 'mensual', currency: 'USD', amountMinor: 2000 })],
      today,
      TRM,
    );
    expect(s.monthlyTotalMinor).toBe(8_000_000);
  });

  it('mezcla COP y USD en el total mensual', () => {
    const s = sustainingSummary(
      [
        svc({ id: 'cop', status: 'paga', cadence: 'mensual', currency: 'COP', amountMinor: 50000 }),
        svc({ id: 'usd', status: 'paga', cadence: 'anual', currency: 'USD', amountMinor: 24000 }), // US$20/mes → $80.000
      ],
      today,
      TRM,
    );
    expect(s.monthlyTotalMinor).toBe(50000 + 8_000_000);
  });

  it('alerta de recarga cuando el saldo <= umbral', () => {
    const s = sustainingSummary(
      [svc({ id: 'g', name: 'OpenAI', balanceMinor: 3000, alertThresholdMinor: 5000 })],
      today,
      TRM,
    );
    const a = s.alerts.find((x) => x.kind === 'recargar');
    expect(a?.name).toBe('OpenAI');
  });

  it('la alerta de saldo se compara en la moneda del servicio (sin convertir)', () => {
    // US$3 de saldo, umbral US$5 → alerta; el saldo reportado sigue en centavos USD.
    const s = sustainingSummary(
      [svc({ id: 'g', name: 'OpenAI', currency: 'USD', balanceMinor: 300, alertThresholdMinor: 500 })],
      today,
      TRM,
    );
    const a = s.alerts.find((x) => x.kind === 'recargar');
    expect(a?.currency).toBe('USD');
    expect(a?.balanceMinor).toBe(300);
  });

  it('no alerta de recarga cuando el saldo está por encima del umbral', () => {
    const s = sustainingSummary(
      [svc({ balanceMinor: 9000, alertThresholdMinor: 5000 })],
      today,
      TRM,
    );
    expect(s.alerts.some((x) => x.kind === 'recargar')).toBe(false);
  });

  it('alerta de renovación si renews_on está dentro de la ventana', () => {
    const s = sustainingSummary([svc({ id: 'r', name: 'Vercel', renewsOn: '2026-08-26' })], today, TRM);
    expect(s.alerts.some((x) => x.kind === 'renovacion')).toBe(true);
  });

  it('no alerta de renovación si falta mucho', () => {
    const s = sustainingSummary([svc({ renewsOn: '2026-12-01' })], today, TRM);
    expect(s.alerts.some((x) => x.kind === 'renovacion')).toBe(false);
  });
});

describe('createSustaining / deleteSustaining', () => {
  it('crea y borra', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createSustaining(ctx, repo, {
      name: 'Anthropic',
      category: 'ia',
      status: 'paga',
      cadence: 'uso',
      amountMinor: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = await deleteSustaining(ctx, repo, r.value.id);
    expect(d.ok).toBe(true);
    expect(await repo.getSustaining(r.value.id)).toBeNull();
  });

  it('rechaza nombre vacío', async () => {
    const repo = makeFakeFinanceRepo();
    const r = await createSustaining(ctx, repo, { name: '  ', category: 'ia', status: 'paga', cadence: 'uso', amountMinor: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });
});
