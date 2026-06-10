import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginFederationConfig } from '../../scripts/vite-federation.config.mjs';

// Project root = the dir holding `frontend/` and `plugin.json`.
const here = dirname(fileURLToPath(import.meta.url));

export default createPluginFederationConfig({ name: 'shelly', dir: join(here, '..') });
