/// <reference lib="webworker" />
import { RenderRequest } from './openscad.contracts';
import { RenderResponse } from './openscad.contracts';
import { renderPart } from './openscad.helpers';
import { assertionMessage } from './openscad.helpers';
import { renderErrorReason } from './openscad.helpers';
import { createSerialQueue } from './openscad.helpers';
import { submit } from './openscad.state';

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
      const response: RenderResponse = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      (self as unknown as Worker).postMessage(response);
    }
  });
};

export { type RenderRequest } from './openscad.contracts';
export { type RenderResponse } from './openscad.contracts';
export { assertionMessage };
export { renderErrorReason };
export { createSerialQueue };
