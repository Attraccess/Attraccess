import { Logger, RequestTimeoutException } from '@nestjs/common';
import type { ClusterService } from '../../cluster/cluster.service';
import { deserializeClusterError, serializeClusterError } from '../../cluster/cluster-errors';
import { isValkeyUnavailableError, valkeyUnavailableException } from '../../valkey/valkey-unavailable';
import type { StoredSupervisionRequest, SupervisionOutcome, SupervisionStore } from './supervision-store';
import { SupervisionWaiters, type SupervisionResult } from './supervision-waiters';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import type { ReaderSupervisionArmer } from './supervision.types';

export const SUPERVISION_EXPIRY_QUEUE = 'supervision';
const SETTLED_MESSAGE = 'supervision.settled';
/** The waiting instance looks the outcome up itself this long after the deadline, if no message reached it. */
export const RECHECK_AFTER_MS = 5_000;
/** An approval that is still starting the session gets this much longer before the requester hears of a timeout. */
const APPROVAL_GRACE_MS = 15_000;

/**
 * Brings a settled request's result to the instance holding its waiter (ATT-1163): directly when that is this
 * instance (always, without Valkey), otherwise over the cluster bus, with the outcome also kept in the store. Pub/sub
 * may lose a message, so the waiting instance looks the outcome up itself once the deadline has passed.
 */
export class SupervisionSettlement {
  readonly waiters = new SupervisionWaiters();
  private readonly logger = new Logger('SupervisionSettlement');

  constructor(
    private readonly store: SupervisionStore,
    private readonly cluster: ClusterService,
    private readonly ttlMs: number,
    private readonly hooks: {
      /** Claims and expires the request; a no-op when it already settled. */
      expire: (requestId: string) => Promise<void>;
      /** Dismisses the request's popups. */
      ended: (request: StoredSupervisionRequest, type: SupervisionLiveEventType) => void;
      readerArmer: () => ReaderSupervisionArmer | null;
    },
  ) {
    cluster.bus.on(SETTLED_MESSAGE, (payload) => {
      const { requestId, outcome } = payload as { requestId: string; outcome: SupervisionOutcome };
      this.waiters.apply(requestId, fromOutcome(outcome));
    });
  }

  /** Hands a claimed request's result to its waiter, wherever it is. */
  settle(request: StoredSupervisionRequest, result: SupervisionResult): void {
    void this.cluster.deadlines.cancel(SUPERVISION_EXPIRY_QUEUE, request.id).catch(() => undefined);
    if (request.readerId !== undefined) {
      void this.store.releaseReaderRequest(request.requester.id, request.id).catch(() => undefined);
    }
    if (request.originInstance === this.cluster.instanceId) {
      this.waiters.apply(request.id, result);
      return;
    }
    const outcome = toOutcome(result);
    void this.store.recordOutcome(request.id, outcome).catch(() => undefined);
    void this.cluster.bus.send(request.originInstance, SETTLED_MESSAGE, { requestId: request.id, outcome });
  }

  /** With other instances, the waiter checks the store itself after the deadline. */
  watch(requestId: string): void {
    if (!this.cluster.enabled) return;
    const timer = setTimeout(() => void this.recheck(requestId, false), this.ttlMs + RECHECK_AFTER_MS);
    timer.unref?.();
    this.waiters.addTimer(requestId, timer);
  }

  /**
   * No outcome reached this instance by the deadline (a lost message, an unreachable Valkey): it looks the outcome
   * up, expires the request itself, or gives an approval in progress a little longer. Nothing waits past that; an
   * unreachable Valkey answers 503.
   */
  async recheck(requestId: string, lastTry: boolean): Promise<void> {
    if (!this.waiters.has(requestId)) return;
    try {
      const outcome = await this.store.outcome(requestId);
      if (outcome) {
        this.waiters.apply(requestId, fromOutcome(outcome));
        return;
      }
      await this.hooks.expire(requestId);
      if (!this.waiters.has(requestId)) return;
      if (!lastTry) {
        const timer = setTimeout(() => void this.recheck(requestId, true), APPROVAL_GRACE_MS);
        timer.unref?.();
        this.waiters.addTimer(requestId, timer);
        return;
      }
      this.fail(requestId, new RequestTimeoutException('Supervision request expired before the supervisor responded'));
    } catch (error) {
      this.fail(
        requestId,
        isValkeyUnavailableError(error)
          ? valkeyUnavailableException(error as Error)
          : new RequestTimeoutException('Supervision request expired before the supervisor responded'),
      );
    }
  }

  /** The requester's HTTP call closed: the request ends everywhere, popups and reader included. */
  async abort(requestId: string): Promise<void> {
    const error = new RequestTimeoutException('The requester disconnected');
    let request: StoredSupervisionRequest | null;
    try {
      request = await this.store.claim(requestId);
    } catch {
      // Valkey is unreachable: the waiter ends here, the deadline cleans up the rest.
      this.fail(requestId, error);
      return;
    }
    // Claimed by an approval (or settled) already: that outcome reaches the waiter.
    if (!request) return;
    this.settle(request, { kind: 'failed', error, notifyReader: true });
    this.hooks.ended(request, SupervisionLiveEventType.EXPIRED);
  }

  /**
   * An instance died: the requests it held a waiter for end (popups dismissed, a reader armed for one returned to
   * normal). Runs on the one instance that cleans up after it.
   */
  async cleanUpAfter(instanceId: string): Promise<void> {
    for (const pending of await this.store.listPending()) {
      if (pending.originInstance !== instanceId) continue;
      const request = await this.store.claim(pending.id);
      if (!request) continue;
      const error = new RequestTimeoutException('The requester disconnected');
      this.settle(request, { kind: 'failed', error, notifyReader: false });
      if (request.readerId !== undefined) {
        this.hooks.readerArmer()?.disarm?.({ readerId: request.readerId, requestId: request.id, error });
      }
      this.hooks.ended(request, SupervisionLiveEventType.EXPIRED);
    }
  }

  /** Reader-side paths never throw: with Valkey unreachable the deadline settles the request later. */
  async claimQuietly(requestId: string): Promise<StoredSupervisionRequest | null> {
    try {
      return await this.store.claim(requestId);
    } catch (error) {
      this.logger.warn(`Could not settle supervision request ${requestId}: ${(error as Error).message}`);
      return null;
    }
  }

  private fail(requestId: string, error: Error): void {
    this.waiters.apply(requestId, { kind: 'failed', error, notifyReader: true });
  }
}

function toOutcome(result: SupervisionResult): SupervisionOutcome {
  return result.kind === 'resolved'
    ? result
    : { kind: 'failed', error: serializeClusterError(result.error), notifyReader: result.notifyReader };
}

function fromOutcome(outcome: SupervisionOutcome): SupervisionResult {
  return outcome.kind === 'resolved'
    ? outcome
    : { kind: 'failed', error: deserializeClusterError(outcome.error), notifyReader: outcome.notifyReader };
}
