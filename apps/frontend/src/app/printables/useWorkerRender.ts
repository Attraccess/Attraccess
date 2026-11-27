import { useEffect, useRef, useState } from 'react';

export type RenderStatus = 'idle' | 'rendering' | 'ready' | 'error';

/** What a printables worker posts back: the parts on success, OpenSCAD's reason on failure. */
export type WorkerResponse<TParts> = ({ id: number; ok: true } & TParts) | { id: number; ok: false; error: string };

const DEBOUNCE_MS = 500;

/**
 * Drives one printables render worker: debounces requests, tags each with a generation id and
 * adopts only the response to the newest one. Shared by `useCardRender` and `usePlugRender`.
 *
 * `requestKey` identifies the request's content. A render starts whenever it changes, so pass
 * a key that ignores anything that does not change the model.
 */
export function useWorkerRender<TParts, TResult>(
  createWorker: () => Worker,
  request: object,
  requestKey: string,
  toResult: (parts: TParts) => TResult,
): { status: RenderStatus; result: TResult | null; error: string | null } {
  const [status, setStatus] = useState<RenderStatus>('idle');
  const [result, setResult] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  // The latest request and converter, read when the debounce fires and a response arrives, so
  // neither has to be an effect dependency (callers pass fresh objects on every render).
  const requestRef = useRef(request);
  requestRef.current = request;
  const toResultRef = useRef(toResult);
  toResultRef.current = toResult;
  const createWorkerRef = useRef(createWorker);

  useEffect(() => {
    const worker = createWorkerRef.current();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse<TParts>>) => {
      // Ignore responses superseded by a newer request.
      if (event.data.id !== requestId.current) return;

      // `=== true`/`=== false` (rather than plain truthiness) works around discriminated-union
      // narrowing being weakened by `strictNullChecks: false` in tsconfig.base.json (`strict:
      // true` in this project's tsconfig.json does not re-enable it — TS resolves strict-family
      // flags individually and an explicit setting earlier in the extends chain wins). With
      // strictNullChecks off, a plain `if (event.data.ok)` fails to narrow away the other arm in
      // the `else` branch.
      if (event.data.ok === true) {
        setResult(toResultRef.current(event.data as TParts));
        setError(null);
        setStatus('ready');
      } else if (event.data.ok === false) {
        setError(event.data.error);
        setStatus('error');
      }
    };

    worker.onerror = (event) => {
      setError(event.message || 'The 3D generator failed to start.');
      setStatus('error');
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Advance the generation here rather than inside the debounced callback. A render already
    // in flight for the previous request has to become stale the instant the request changes:
    // otherwise its response still matches `requestId.current`, flips status back to 'ready',
    // and the download button briefly hands out the OLD geometry under the NEW settings'
    // filename. Bumping on every change closes that window.
    const id = ++requestId.current;

    setStatus('rendering');
    // Clear a previous failure as soon as this render starts (not inside the debounced
    // callback below) so it doesn't linger through the whole next render. This runs once per
    // request change rather than once per debounce tick, so it can't flash the error away and
    // back while the user is still typing.
    setError(null);
    const timer = setTimeout(() => {
      workerRef.current?.postMessage({ id, ...requestRef.current });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [requestKey]);

  return { status, result, error };
}
