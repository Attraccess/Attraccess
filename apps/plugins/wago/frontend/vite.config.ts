import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Build configuration uses the shared plugin federation factory.
import { createPluginFederationConfig } from '../../scripts/vite-federation.config.mjs';
const here = dirname(fileURLToPath(import.meta.url));
export default createPluginFederationConfig({ name: 'wago', dir: join(here, '..') });
