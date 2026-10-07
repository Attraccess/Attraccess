export // energyMicroWh is transported as a string because it can exceed Number.MAX_SAFE_INTEGER.
// Do the microWh->kWh division with BigInt so the integer part stays exact; only the final
// display value is coerced to Number.
// ponytail: Number() below still caps precision beyond ~9 quadrillion kWh (2^53) — no real
// energy meter gets there, upgrade to a decimal/bignumber formatter if that ever changes.
function microWhToKwh(microWh: string): number {
  const value = BigInt(microWh);
  const perKwh = BigInt(1_000_000_000);
  const whole = value / perKwh;
  const fraction = (value % perKwh).toString().padStart(9, '0');
  return Number(`${whole}.${fraction}`);
}
