import { useEffect, useRef, useState } from 'react';
import { parseBinaryStl, type Mesh } from './stl';
import type { RenderRequest, RenderResponse } from './openscad.worker';

export interface CardRender {
  bodyStl: ArrayBuffer;
  lettersStl: ArrayBuffer;
  body: Mesh;
  letters: Mesh;
}

export type RenderStatus = 'idle' | 'rendering' | 'ready' | 'error';

const DEBOUNCE_MS = 500;

export function useCardRender(label: string): {
  status: RenderStatus;
  result: CardRender | null;
  error: string | null;
} {
  const [status, setStatus] = useState<RenderStatus>('idle');
  const [result, setResult] = useState<CardRender | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('./openscad.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<RenderResponse>) => {
      // Ignore responses superseded by a newer keystroke.
      if (event.data.id !== requestId.current) return;

      // `=== true`/`=== false` (rather than plain truthiness) works around discriminated-union
      // narrowing being weakened by `strictNullChecks: false` in tsconfig.base.json (`strict:
      // true` in this project's tsconfig.json does not re-enable it — TS resolves strict-family
      // flags individually and an explicit setting earlier in the extends chain wins). With
      // strictNullChecks off, a plain `if (event.data.ok)` fails to narrow away the other arm in
      // the `else` branch. This affects any `if (x.discriminant)` narrowing anywhere in this
      // project while strictNullChecks stays off, not just this file.
      if (event.data.ok === true) {
        setResult({
          bodyStl: event.data.body,
          lettersStl: event.data.letters,
          body: parseBinaryStl(event.data.body),
          letters: parseBinaryStl(event.data.letters),
        });
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
    setStatus('rendering');
    const timer = setTimeout(() => {
      const request: RenderRequest = { id: ++requestId.current, label };
      workerRef.current?.postMessage(request);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [label]);

  return { status, result, error };
}
