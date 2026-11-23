import { ForbiddenException, RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { ClusterService } from '../../cluster/cluster.service';
import { serializeClusterError } from '../../cluster/cluster-errors';
import { InMemorySupervisionStore, type SupervisionStore } from './supervision-store';
import { SupervisionSettlement } from './supervision-settlement';

/** The waiting instance's own look-up after the deadline (ATT-1163), when no outcome message reached it. */
describe('SupervisionSettlement.recheck', () => {
  const setUp = (store: Partial<SupervisionStore>, expire = jest.fn().mockResolvedValue(undefined)) => {
    const settlement = new SupervisionSettlement(
      Object.assign(new InMemorySupervisionStore(), store),
      ClusterService.local(),
      30_000,
      { expire, ended: jest.fn(), readerArmer: () => null },
    );
    const resolve = jest.fn();
    const reject = jest.fn();
    const readerCallbacks = { onResolved: jest.fn(), onFailed: jest.fn() };
    settlement.waiters.add('r1', { resolve, reject, readerCallbacks });
    return { settlement, resolve, reject, readerCallbacks, expire };
  };

  afterEach(() => jest.useRealTimers());

  it('does nothing once the waiter has settled', async () => {
    const outcome = jest.fn();
    const { settlement } = setUp({ outcome });
    settlement.waiters.apply('r1', { kind: 'failed', error: new Error('x'), notifyReader: false });
    await settlement.recheck('r1', false);
    expect(outcome).not.toHaveBeenCalled();
  });

  it('applies an outcome another instance recorded', async () => {
    const { settlement, reject, readerCallbacks } = setUp({
      outcome: async () => ({
        kind: 'failed',
        error: serializeClusterError(new ForbiddenException('rejected')),
        notifyReader: true,
      }),
    });
    await settlement.recheck('r1', false);
    expect(reject).toHaveBeenCalledWith(expect.any(ForbiddenException));
    expect(readerCallbacks.onFailed).toHaveBeenCalled();
  });

  it('applies a recorded approval', async () => {
    const session = { id: 1 } as never;
    const supervisor = { id: 2, username: 's', displayName: 's' };
    const { settlement, resolve, readerCallbacks } = setUp({
      outcome: async () => ({ kind: 'resolved', session, supervisor }),
    });
    await settlement.recheck('r1', false);
    expect(resolve).toHaveBeenCalledWith(session);
    expect(readerCallbacks.onResolved).toHaveBeenCalledWith(session, supervisor);
  });

  it('expires the request itself when nobody settled it', async () => {
    let settlement!: SupervisionSettlement;
    const expire = jest.fn(async () =>
      settlement.waiters.apply('r1', { kind: 'failed', error: new RequestTimeoutException(), notifyReader: true }),
    );
    const setup = setUp({ outcome: async () => null }, expire);
    settlement = setup.settlement;
    await settlement.recheck('r1', false);
    expect(expire).toHaveBeenCalledWith('r1');
    expect(setup.reject).toHaveBeenCalledWith(expect.any(RequestTimeoutException));
  });

  it('gives an approval in progress a little longer, then times the requester out', async () => {
    jest.useFakeTimers();
    const { settlement, reject } = setUp({ outcome: async () => null });
    await settlement.recheck('r1', false);
    expect(reject).not.toHaveBeenCalled();
    await settlement.recheck('r1', true);
    expect(reject).toHaveBeenCalledWith(expect.any(RequestTimeoutException));
  });

  it('answers 503 when Valkey cannot be asked, and 408 for any other failure', async () => {
    const unavailable = setUp({
      outcome: async () => {
        throw new Error('Valkey is reconnecting');
      },
    });
    await unavailable.settlement.recheck('r1', false);
    expect(unavailable.reject).toHaveBeenCalledWith(expect.any(ServiceUnavailableException));

    const broken = setUp({
      outcome: async () => {
        throw new Error('script error');
      },
    });
    await broken.settlement.recheck('r1', false);
    expect(broken.reject).toHaveBeenCalledWith(expect.any(RequestTimeoutException));
  });
});
