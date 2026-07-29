// Shared Vite module-federation config factory for Attraccess plugin nx apps.
//
// Produces a federation *remote* exposing `./plugin` and emits `remoteEntry.js`
// at the output root so the manifest's `main.frontend.entryPoint` resolves. Host
// singletons are declared `shared` so the plugin reuses the host's single copy
// instead of bundling its own — see docs/en/plugins/developing-plugins.md
// ("Packaging the frontend").
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { join } from 'node:path';

// Every host singleton a plugin may import at runtime. Sharing them keeps the
// plugin bundle small and guarantees a single, host-themed instance.
const HOST_SHARED = {
  react: { singleton: true, requiredVersion: '*' },
  'react-dom': { singleton: true, requiredVersion: '*' },
  'react-router-dom': { singleton: true, requiredVersion: '*' },
  '@heroui/react': { singleton: true, requiredVersion: '*' },
  'lucide-react': { singleton: true, requiredVersion: '*' },
};

/**
 * @param {object} opts
 * @param {string} opts.name plugin name (kebab-case); the federation remote is named `plugin-${name}`
 * @param {string} opts.dir absolute path to the plugin project root (the dir holding `frontend/` and `plugin.json`)
 */
export function createPluginFederationConfig({ name, dir }) {
  return defineConfig({
    root: join(dir, 'frontend'),
    plugins: [
      react(),
      // In-repo plugins import `@attraccess/plugins-frontend-sdk` (for the API
      // client, not just types) from the workspace source rather than the
      // published package — resolve the tsconfig path aliases so that works.
      nxViteTsPaths(),
      federation({
        name: `plugin-${name}`,
        filename: 'remoteEntry.js',
        exposes: { './plugin': './src/plugin.tsx' },
        shared: HOST_SHARED,
      }),
    ],
    build: {
      target: 'esnext',
      minify: false,
      cssCodeSplit: false,
      // Emit remoteEntry.js at the output root, not under assets/.
      assetsDir: '',
      outDir: join(dir, 'package', 'frontend'),
      emptyOutDir: true,
    },
  });
}
