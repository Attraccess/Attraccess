import { catchError, defer, exhaustMap, finalize, map, Observable, of, shareReplay, timer } from 'rxjs';

export type LiveSample<Value> = {
  data: { eventType: 'snapshot'; value: Value } | { eventType: 'unavailable' };
};

/** Share status reads per key until the final subscriber leaves. */
export function createSharedLiveSampler<Key, Value = unknown>() {
  const sources = new Map<Key, Observable<LiveSample<Value>>>();

  return (key: Key, intervalMs: number, read: () => Promise<Value>): Observable<LiveSample<Value>> =>
    defer(() => {
      let source = sources.get(key);
      if (!source) {
        source = timer(0, intervalMs).pipe(
          // Skip ticks while a read is pending; failures allow the next tick to recover.
          exhaustMap(() =>
            defer(read).pipe(
              map((value): LiveSample<Value> => ({ data: { eventType: 'snapshot', value } })),
              // Device errors may contain credentials, so only expose availability.
              catchError(() => of<LiveSample<Value>>({ data: { eventType: 'unavailable' } })),
            ),
          ),
          finalize(() => {
            if (sources.get(key) === source) sources.delete(key);
          }),
          shareReplay({ bufferSize: 1, refCount: true }),
        );
        sources.set(key, source);
      }
      return source;
    });
}
