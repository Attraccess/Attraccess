import { useEffect, useRef, useState } from 'react';
import { parseBinaryStl, type Mesh } from './stl';
import type { PlugRenderRequest, PlugRenderResponse } from './smart-plug.worker';

export interface PlugRender {
  bodyStl: ArrayBuffer;
  coverStl: ArrayBuffer;
  body: Mesh;
  cover: Mesh;
}

export type PlugDevice = 'nous_a1' | 'shelly_plus_gen3' | 'shelly_legacy';
export type PlugCable = 'straight_schuko' | 'straight_euro' | 'angled_schuko' | 'angled_euro';

export function usePlugRender(
  device: PlugDevice,
  cable: PlugCable,
  deviceExtraDiameter: number,
  cordOpeningDiameter: number,
  heightAbovePlug: number,
  cableCutoutHeight: number,
) {
  const [status, setStatus] = useState<'rendering' | 'ready' | 'error'>('rendering');
  const [result, setResult] = useState<PlugRender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('./smart-plug.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<PlugRenderResponse>) => {
      if (event.data.id !== requestId.current) return;
      if (event.data.ok === true) {
        setResult({
          bodyStl: event.data.body,
          coverStl: event.data.cover,
          body: parseBinaryStl(event.data.body),
          cover: parseBinaryStl(event.data.cover),
        });
        setError(null);
        setStatus('ready');
      } else if (event.data.ok === false) {
        setError(event.data.error);
        setStatus('error');
      }
    };
    worker.onerror = (event) => {
      setError(event.message);
      setStatus('error');
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    const id = ++requestId.current;
    setStatus('rendering');
    setError(null);
    const timer = setTimeout(
      () =>
        workerRef.current?.postMessage({
          id,
          device,
          cable,
          deviceExtraDiameter,
          cordOpeningDiameter,
          heightAbovePlug,
          cableCutoutHeight,
        } satisfies PlugRenderRequest),
      250,
    );
    return () => clearTimeout(timer);
  }, [device, cable, deviceExtraDiameter, cordOpeningDiameter, heightAbovePlug, cableCutoutHeight]);

  return { status, result, error };
}
