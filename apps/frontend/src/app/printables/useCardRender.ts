import { parseBinaryStl, type Mesh } from './stl';
import { useWorkerRender, type RenderStatus } from './useWorkerRender';

export type { RenderStatus };

export interface CardRender {
  bodyStl: ArrayBuffer;
  lettersStl: ArrayBuffer;
  body: Mesh;
  letters: Mesh;
}

function createCardWorker(): Worker {
  return new Worker(new URL('./openscad.worker.ts', import.meta.url), { type: 'module' });
}

function toCardRender(parts: { body: ArrayBuffer; letters: ArrayBuffer }): CardRender {
  return {
    bodyStl: parts.body,
    lettersStl: parts.letters,
    body: parseBinaryStl(parts.body),
    letters: parseBinaryStl(parts.letters),
  };
}

export function useCardRender(label: string): {
  status: RenderStatus;
  result: CardRender | null;
  error: string | null;
} {
  return useWorkerRender(createCardWorker, { label }, label, toCardRender);
}
