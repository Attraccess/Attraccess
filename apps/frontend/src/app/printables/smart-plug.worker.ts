/// <reference lib="webworker" />

import scadSource from './smart-plug-cover.scad?raw';
import { createSerialQueue, errorResponse, renderScad, yieldToMessages, type WorkerResponse } from './openscadRuntime';
import { toScadDefines, type PlugConfig } from './smartPlugConfig';

export interface PlugRenderRequest {
  id: number;
  config: PlugConfig;
}

export type PlugRenderResponse = WorkerResponse<{ body: ArrayBuffer; cover: ArrayBuffer }>;

/**
 * Renders the body, then the cover, unless a newer request has arrived in between: the cover
 * would be thrown away, so the queue moves on to the newer request instead. Resolves to null
 * when the render was abandoned.
 */
export async function renderPlug(
  config: PlugConfig,
  isCurrent: () => boolean,
  render: typeof renderScad = renderScad,
): Promise<{ body: ArrayBuffer; cover: ArrayBuffer } | null> {
  const defines = toScadDefines(config);
  const body = await render(scadSource, { ...defines, PART: '"body"' });
  await yieldToMessages();
  if (!isCurrent()) return null;
  const cover = await render(scadSource, { ...defines, PART: '"cover"' });
  return { body, cover };
}

/** Handles one request; exported so the supersede behaviour can be tested without a Worker. */
export function createPlugMessageHandler(
  post: (response: PlugRenderResponse, transfer?: Transferable[]) => void,
  render: typeof renderScad = renderScad,
): (request: PlugRenderRequest) => void {
  const submit = createSerialQueue();

  return ({ id, config }) =>
    submit(id, async (isCurrent) => {
      try {
        const parts = await renderPlug(config, isCurrent, render);
        if (parts === null) return;
        post({ id, ok: true, ...parts }, [parts.body, parts.cover]);
      } catch (error) {
        post(errorResponse(id, error));
      }
    });
}

// OpenSCAD stays at arm's length (GPL); see OPENSCAD_BASE in openscadRuntime.ts.
const handle = createPlugMessageHandler((response, transfer = []) =>
  (self as unknown as Worker).postMessage(response, transfer),
);
self.onmessage = (event: MessageEvent<PlugRenderRequest>) => handle(event.data);
