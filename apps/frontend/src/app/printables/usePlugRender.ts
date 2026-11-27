import { parseBinaryStl, type Mesh } from './stl';
import { effectivePlugConfig, type PlugConfig } from './smartPlugConfig';
import { useWorkerRender, type RenderStatus } from './useWorkerRender';

export interface PlugRender {
  bodyStl: ArrayBuffer;
  coverStl: ArrayBuffer;
  body: Mesh;
  cover: Mesh;
}

function createPlugWorker(): Worker {
  return new Worker(new URL('./smart-plug.worker.ts', import.meta.url), { type: 'module' });
}

function toPlugRender(parts: { body: ArrayBuffer; cover: ArrayBuffer }): PlugRender {
  return {
    bodyStl: parts.body,
    coverStl: parts.cover,
    body: parseBinaryStl(parts.body),
    cover: parseBinaryStl(parts.cover),
  };
}

/**
 * Renders the cover for `config`. Only the effective configuration counts: a straight cable's
 * hidden angled heights neither trigger a render nor reach the worker.
 */
export function usePlugRender(config: PlugConfig): {
  status: RenderStatus;
  result: PlugRender | null;
  error: string | null;
} {
  const effective = effectivePlugConfig(config);
  return useWorkerRender(createPlugWorker, { config: effective }, JSON.stringify(effective), toPlugRender);
}
