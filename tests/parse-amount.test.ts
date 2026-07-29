import { describe, it, expect } from 'vitest';
import { parseAmountToMinor } from '@/lib/parse-amount';

describe('parseAmountToMinor', () => {
  it('entero simple → ×100', () => {
    expect(parseAmountToMinor('50000')).toBe(5_000_000);
    expect(parseAmountToMinor('100')).toBe(10_000);
  });

  it("'.' como separador de miles (COP)", () => {
    expect(parseAmountToMinor('50.000')).toBe(5_000_000);
    expect(parseAmountToMinor('1.234.567')).toBe(123_456_700);
  });

  it("',' o '.' como decimal (USD)", () => {
    expect(parseAmountToMinor('12,50')).toBe(1_250);
    expect(parseAmountToMinor('12.50')).toBe(1_250);
    expect(parseAmountToMinor('12,5')).toBe(1_250); // "5" = 50 centavos
    expect(parseAmountToMinor('0,99')).toBe(99);
  });

  it('miles + decimal mezclados', () => {
    expect(parseAmountToMinor('1.234,56')).toBe(123_456);
    expect(parseAmountToMinor('1,234.56')).toBe(123_456);
  });

  it('rechaza vacío, cero y basura', () => {
    expect(parseAmountToMinor('')).toBeNull();
    expect(parseAmountToMinor('  ')).toBeNull();
    expect(parseAmountToMinor('0')).toBeNull();
    expect(parseAmountToMinor('abc')).toBeNull();
    expect(parseAmountToMinor('1.2.')).toBeNull();
    expect(parseAmountToMinor('-5')).toBeNull();
  });
});
