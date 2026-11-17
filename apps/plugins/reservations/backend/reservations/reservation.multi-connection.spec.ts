import { ReservationError } from './errors';
import { Harness, at, createHarness, principal } from '../testing/harness.test-utils';

const slot = { startTime: at('2026-06-02T08:00:00'), endTime: at('2026-06-02T09:00:00') };

/**
 * Two independent hosts (own services, own in-process mutex) on one storage: only the port's transactions (overlap
 * check and insert in one scope) keep overlapping creates apart, as between two API processes.
 */
describe('reservation creates across two connections', () => {
  let first: Harness;
  let second: Harness;

  beforeEach(async () => {
    first = await createHarness();
    second = await createHarness({ share: first });
    await first.enable(1, { maxActiveBookingsPerUser: 0 });
  });

  afterEach(async () => {
    await second.close();
    await first.close();
  });

  /** N overlapping creates, alternating between the two hosts, all started at once. */
  const createConcurrently = (count: number) =>
    Promise.allSettled(
      Array.from({ length: count }, (_, i) =>
        (i % 2 === 0 ? first : second).reservations.create(principal(100 + i), { resourceId: 1, ...slot }),
      ),
    );

  const rejectionCodes = (results: PromiseSettledResult<unknown>[]) =>
    results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => (result.reason instanceof ReservationError ? result.reason.code : String(result.reason)));

  it('lets exactly one of N overlapping creates win', async () => {
    const results = await createConcurrently(10);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(rejectionCodes(results)).toEqual(Array(9).fill('OVERLAP'));
    expect(await first.tables.reservations.count()).toBe(1);
  });

  it('never exceeds the session limit of a shared machine', async () => {
    first.setLimit(1, 3);
    second.setLimit(1, 3);

    const results = await createConcurrently(10);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    expect(rejectionCodes(results)).toEqual(Array(7).fill('OVERLAP'));
    expect(await second.tables.reservations.count()).toBe(3);
  });
});
