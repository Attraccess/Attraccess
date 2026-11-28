import type { ResourceMeterRecord, ResourceMeteringSessionRecord } from '@attraccess/application-models';
import { partMeterCharge, partMeterDiscount } from './continued-meter-charge';
import { MeteringCatalog } from './metering-catalog';
import type { MeteringStore } from './metering-store.port';
import { meterCharge, meterDiscount, toMeterValue } from './quantity';
import { sessionShare } from './segment-charges';

const units = (value: string) => toMeterValue(value);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Bills the parts of one meter one after the other, each rounded with the consumption before it. */
function billParts(consumptions: bigint[], rate: number) {
  let prior = BigInt(0);
  return consumptions.map((consumption) => {
    const charge = partMeterCharge(prior, consumption, rate);
    prior += consumption;
    return charge;
  });
}

describe('ATT-1421: the meter charge of the parts of a switched session', () => {
  it('adds the parts up to the charge of one unsplit session where each part alone rounds to nothing', () => {
    const parts = Array.from({ length: 10 }, () => units('0.46'));

    expect(parts.map((part) => meterCharge(part, 1))).toEqual(Array(10).fill(0));
    expect(billParts(parts, 1)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(sum(billParts(parts, 1))).toBe(meterCharge(units('4.6'), 1));
  });

  it('never bills more or less than one session, whatever the parts consume', () => {
    let seed = 11;
    const next = (limit: number) => (seed = (seed * 48_271) % 2_147_483_647) % limit;
    for (let round = 0; round < 200; round++) {
      const rate = 1 + next(40);
      const parts = Array.from({ length: 1 + next(8) }, () => BigInt(next(3_000_000_000)));
      const total = parts.reduce((all, part) => all + part, BigInt(0));
      expect(sum(billParts(parts, rate))).toBe(meterCharge(total, rate));
    }
  });

  it('is the plain charge and discount without earlier parts', () => {
    expect(partMeterCharge(BigInt(0), units('2.5'), 30)).toBe(meterCharge(units('2.5'), 30));
    expect(partMeterDiscount(BigInt(0), 75, 30, 33)).toBe(meterDiscount(75, 33));
  });

  it.each([33, 50])('rounds the discount at a factor of %i %% on the meter running charge', (factor) => {
    const parts = Array.from({ length: 7 }, () => units('0.46'));
    let prior = BigInt(0);
    let discounts = 0;
    for (const part of parts) {
      discounts += partMeterDiscount(prior, partMeterCharge(prior, part, 3), 3, factor);
      prior += part;
    }
    expect(discounts).toBe(meterDiscount(meterCharge(prior, 3), factor));
  });

  it('rounds a solo share with the earlier parts, but keeps a shared one per segment', () => {
    const segment = (usageIds: number[], startValue: string, endValue: string) => ({
      id: `s${startValue}`,
      startedAt: new Date('2026-11-01T10:00:00Z'),
      endedAt: new Date('2026-11-01T10:05:00Z'),
      startValue: units(startValue).toString(),
      endValue: units(endValue).toString(),
      participants: usageIds.map((usageId) => ({ usageId, sessionId: `m${usageId}`, creditsPerUnit: 1 })),
    });

    expect(sessionShare([segment([2], '0', '0.46')], 2).credits).toBe(0);
    expect(sessionShare([segment([2], '0', '0.46')], 2, units('0.46')).credits).toBe(1);
    const shared = [segment([2, 3], '0', '0.92')];
    expect(sessionShare(shared, 2, units('0.46'))).toEqual(sessionShare(shared, 2));
    expect(sessionShare(shared, 2).solo).toBe(false);
  });

  it('shows a running part what it is billed so far, rounded with the earlier parts', async () => {
    const meter = {
      id: 1,
      resourceId: 1,
      name: 'Energy',
      creditsPerUnit: 1,
      archivedAt: null,
      lifetimeValue: '0',
      counterValue: null,
    } as ResourceMeterRecord;
    const session = {
      id: 'm2',
      usageId: 2,
      meterId: 1,
      meterName: 'Energy',
      creditsPerUnit: 1,
      accounting: 'own',
      latestValue: units('0.46').toString(),
    } as ResourceMeteringSessionRecord;
    const findContinuedMeterConsumption = jest.fn().mockResolvedValue(units('0.46'));
    const store = {
      listMeters: jest.fn().mockResolvedValue([meter]),
      findRunningUsages: jest.fn().mockResolvedValue([{ id: 2, resourceId: 1, meterRates: null }]),
      findSessionLimit: jest.fn().mockResolvedValue(1),
      findRunningSessions: jest.fn().mockResolvedValue([session]),
      findContinuedMeterConsumption,
    } as unknown as MeteringStore;

    const [listed] = await new MeteringCatalog(store).listMeters(1);

    expect(listed.session).toMatchObject({ usageId: 2, chargeCredits: 1 });
    expect(findContinuedMeterConsumption).toHaveBeenCalledWith(2, 1, 1, undefined);
  });
});
