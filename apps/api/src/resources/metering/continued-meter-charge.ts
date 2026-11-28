import { applyPartBillingFactor } from '@attraccess/shared';
import type { TransactionContext } from '../../database/transaction-context';
import type { MeteringStore } from './metering-store.port';
import { meterCharge } from './quantity';

/**
 * ATT-1421: each part of a switched session has a metering session of its own, but in `continue` mode its meter
 * charge is rounded together with the earlier parts of the run: the whole credits of the run's consumption so far
 * less those of the consumption before the part. The parts of one meter so add up to the charge of one unsplit
 * session, however often the project was switched. With `priorConsumption` 0 it is the plain charge.
 */
export function partMeterCharge(priorConsumption: bigint, consumption: bigint, creditsPerUnit: number): number {
  return meterCharge(priorConsumption + consumption, creditsPerUnit) - meterCharge(priorConsumption, creditsPerUnit);
}

/**
 * The billing factor's discount on a part's meter charge that is billed on a bill of its own (a late correction),
 * rounded on the meter's running charge like the charge itself. With `priorConsumption` 0 it is the plain discount.
 */
export function partMeterDiscount(
  priorConsumption: bigint,
  charge: number,
  creditsPerUnit: number,
  factor: number,
): number {
  const priorCharge = meterCharge(priorConsumption, creditsPerUnit);
  return applyPartBillingFactor(BigInt(priorCharge), BigInt(charge), factor).discount;
}

/** What the earlier parts of the session's run consumed on its meter, at its rate. */
export function priorConsumptionOf(
  store: MeteringStore,
  session: { usageId: number; meterId: number; creditsPerUnit: number },
  context?: TransactionContext,
): Promise<bigint> {
  return store.findContinuedMeterConsumption(session.usageId, session.meterId, session.creditsPerUnit, context);
}
