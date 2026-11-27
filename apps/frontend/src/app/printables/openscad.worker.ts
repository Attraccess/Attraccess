/// <reference lib="webworker" />

import scadSource from './rfid-keychain-card.scad?raw';
import { createSerialQueue, errorResponse, renderScad } from './openscadRuntime';

export interface RenderRequest {
  id: number;
  label: string;
}

export type RenderResponse =
  { id: number; ok: true; body: ArrayBuffer; letters: ArrayBuffer } | { id: number; ok: false; error: string };

const submit = createSerialQueue();

function renderPart(label: string, part: 'body' | 'letters'): Promise<ArrayBuffer> {
  return renderScad(scadSource, { PART: JSON.stringify(part), LABEL: JSON.stringify(label) });
}

// OpenSCAD is GPL-licensed and deliberately kept at arm's length: it is fetched as an
// unbundled static asset and driven through argv + a virtual filesystem, exactly like the
// CLI. See apps/frontend/public/openscad/NOTICE.md. Do not import it into the main bundle.
self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, label } = event.data;

  submit(id, async () => {
    try {
      const body = await renderPart(label, 'body');
      const letters = await renderPart(label, 'letters');
      const response: RenderResponse = { id, ok: true, body, letters };
      (self as unknown as Worker).postMessage(response, [body, letters]);
    } catch (error) {
      (self as unknown as Worker).postMessage(errorResponse(id, error) satisfies RenderResponse);
    }
  });
};
