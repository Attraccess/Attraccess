import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginFederationConfig } from '../../scripts/vite-federation.config.mjs';
const here = dirname(fileURLToPath(import.meta.url));
export default createPluginFederationConfig({ name: 'wago', dir: join(here, '..') });
