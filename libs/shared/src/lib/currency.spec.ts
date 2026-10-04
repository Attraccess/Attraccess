import { applyBillingFactor, dbCurrencyToUserCurrency, toExactCredits, userCurrencyToDbCurrency } from './currency';

describe('currency', () => {
  it('should convert api currency to frontend currency', () => {
    expect(dbCurrencyToUserCurrency(100, 2)).toBe(1);
    expect(dbCurrencyToUserCurrency(100, 3)).toBe(0.1);
    expect(dbCurrencyToUserCurrency(100, 4)).toBe(0.01);
    expect(dbCurrencyToUserCurrency(100, 5)).toBe(0.001);
    expect(dbCurrencyToUserCurrency(100, 6)).toBe(0.0001);
    expect(dbCurrencyToUserCurrency(100, 7)).toBe(0.00001);
    expect(dbCurrencyToUserCurrency(100, 8)).toBe(0.000001);
    expect(dbCurrencyToUserCurrency(100, 9)).toBe(0.0000001);

    expect(dbCurrencyToUserCurrency(1253, 2)).toBe(12.53);
    expect(dbCurrencyToUserCurrency(1470, 2)).toBe(14.7);
  });

  it('should convert frontend currency to api currency', () => {
    expect(userCurrencyToDbCurrency(1, 2)).toBe(100);
    expect(userCurrencyToDbCurrency(0.1, 3)).toBe(100);
    expect(userCurrencyToDbCurrency(0.01, 4)).toBe(100);
    expect(userCurrencyToDbCurrency(0.001, 5)).toBe(100);
    expect(userCurrencyToDbCurrency(0.0001, 6)).toBe(100);

    expect(userCurrencyToDbCurrency(14.7, 2)).toBe(1470);
  });

  it.each([
    [45, 50, 22, 23],
    [45, 150, 67, -22],
    [4, 12.5, 0, 4],
    [100, 12.5, 12, 88],
    [Number.MAX_SAFE_INTEGER, 50, 4503599627370495, 4503599627370496],
    [-45, 50, -23, -22],
  ])('applies the exact settlement policy to %s credits at %s%%', (gross, factor, amount, discount) => {
    expect(applyBillingFactor(toExactCredits(gross), factor)).toEqual({ amount, discount });
  });

  it('rejects out-of-range aggregate charges and surcharges', () => {
    expect(() => applyBillingFactor(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), 100)).toThrow('billing range');
    expect(() => applyBillingFactor(toExactCredits(Number.MAX_SAFE_INTEGER), 200)).toThrow('billing range');
    expect(() => toExactCredits(Number.MAX_SAFE_INTEGER + 1)).toThrow('billing range');
  });
});
