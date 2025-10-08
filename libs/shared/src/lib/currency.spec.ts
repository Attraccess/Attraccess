import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from './currency';

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
});
