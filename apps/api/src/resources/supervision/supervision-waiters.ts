import type { UsageSession } from '@attraccess/application-models';
import type { ReaderSupervisionCallbacks } from './supervision.types';

/** How a request ended, with live objects (errors keep their class) for this instance's waiter. */
export type SupervisionResult =
  | { kind: 'resolved'; session: UsageSession; supervisor: { id: number; username: string; displayName: string } }
  | { kind: 'failed'; error: Error; notifyReader: boolean };

interface Waiter {
  resolve: (session: UsageSession) => void;
  reject: (error: Error) => void;
  readerCallbacks?: ReaderSupervisionCallbacks;
  removeAbortListener?: () => void;
  timers: NodeJS.Timeout[];
}

/**
 * What only the instance that created a request holds (ATT-1163): the requester's blocked promise, the reader
 * callbacks, the abort listener and timers. Whichever instance settles the request, the result is applied here.
 */
export class SupervisionWaiters {
  private readonly waiters = new Map<string, Waiter>();

  add(requestId: string, waiter: Omit<Waiter, 'timers'>): void {
    this.waiters.set(requestId, { ...waiter, timers: [] });
  }

  has(requestId: string): boolean {
    return this.waiters.has(requestId);
  }

  setReaderCallbacks(requestId: string, callbacks: ReaderSupervisionCallbacks): void {
    const waiter = this.waiters.get(requestId);
    if (waiter) waiter.readerCallbacks = callbacks;
  }

  setRemoveAbortListener(requestId: string, remove: () => void): void {
    const waiter = this.waiters.get(requestId);
    if (waiter) waiter.removeAbortListener = remove;
  }

  addTimer(requestId: string, timer: NodeJS.Timeout): void {
    this.waiters.get(requestId)?.timers.push(timer);
  }

  /** Settles the waiter once; later results for the same request are ignored. */
  apply(requestId: string, result: SupervisionResult): void {
    const waiter = this.waiters.get(requestId);
    if (!waiter) return;
    this.waiters.delete(requestId);
    waiter.removeAbortListener?.();
    waiter.timers.forEach((timer) => clearTimeout(timer));
    if (result.kind === 'resolved') {
      waiter.resolve(result.session);
      waiter.readerCallbacks?.onResolved(result.session, result.supervisor);
      return;
    }
    waiter.reject(result.error);
    if (result.notifyReader) waiter.readerCallbacks?.onFailed(result.error);
  }

  clear(): void {
    for (const waiter of this.waiters.values()) {
      waiter.removeAbortListener?.();
      waiter.timers.forEach((timer) => clearTimeout(timer));
    }
    this.waiters.clear();
  }
}
