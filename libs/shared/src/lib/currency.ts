export function dbCurrencyToUserCurrency(amount: number, minorUnit: number) {
  const factor = Math.pow(10, minorUnit);
  return amount / factor;
}

export function userCurrencyToDbCurrency(amount: number, minorUnit: number) {
  const factor = Math.pow(10, minorUnit);
  return Math.round(amount * factor);
}
