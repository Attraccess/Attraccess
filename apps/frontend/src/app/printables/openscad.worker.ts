/// <reference lib="webworker" />

import scadSource from './rfid-keychain-card.scad?raw';
import { createSerialQueue, errorResponse, renderScad, yieldToMessages, type WorkerResponse } from './openscadRuntime';

export interface RenderRequest {
  id: number;
  label: string;
}

export type RenderResponse = WorkerResponse<{ body: ArrayBuffer; letters: ArrayBuffer }>;

const submit = createSerialQueue();

function renderPart(label: string, part: 'body' | 'letters'): Promise<ArrayBuffer> {
  return renderScad(scadSource, { PART: JSON.stringify(part), LABEL: JSON.stringify(label) });
}

// OpenSCAD stays at arm's length (GPL); see OPENSCAD_BASE in openscadRuntime.ts.
self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, label } = event.data;

  submit(id, async (isCurrent) => {
    try {
      const body = await renderPart(label, 'body');
      // A newer label makes the letters useless; move on to it instead.
      await yieldToMessages();
      if (!isCurrent()) return;
      const letters = await renderPart(label, 'letters');
      const response: RenderResponse = { id, ok: true, body, letters };
      (self as unknown as Worker).postMessage(response, [body, letters]);
    } catch (error) {
      (self as unknown as Worker).postMessage(errorResponse(id, error) satisfies RenderResponse);
    }
  });
};
