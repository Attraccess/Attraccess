import { createSerialQueue } from './openscad.helpers';
export const FONT_FILE = 'Sansation_Regular.ttf';
export // OpenSCAD is GPL-licensed and deliberately kept at arm's length: it is fetched as an
// unbundled static asset and driven through argv + a virtual filesystem, exactly like the
// CLI. See apps/frontend/public/openscad/NOTICE.md. Do not import it into the main bundle.
const OPENSCAD_BASE = '/openscad';

export const submit = createSerialQueue();
