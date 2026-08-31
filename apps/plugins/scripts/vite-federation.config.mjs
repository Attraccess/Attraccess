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
import tailwindcssImport from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { join } from 'node:path';

// Vite bundles this config to CJS, which wraps the ESM default export.
const tailwindcss = tailwindcssImport.default ?? tailwindcssImport;

// Every host singleton a plugin may import at runtime. Sharing them keeps the
// plugin bundle small and guarantees a single, host-themed instance.
export const HOST_SHARED = {
  react: { singleton: true, requiredVersion: '*', import: false, generate: false },
  'react-dom': { singleton: true, requiredVersion: '*', import: false, generate: false },
  'react-router-dom': { singleton: true, requiredVersion: '*', import: false, generate: false },
  '@heroui/react': { singleton: true, requiredVersion: '*', import: false, generate: false },
  'lucide-react': { singleton: true, requiredVersion: '*', import: false, generate: false },
  '@tanstack/react-query': { singleton: true, requiredVersion: '*', import: false, generate: false },
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
      // Compiles the plugin's own Tailwind utilities into a self-contained
      // style.css (see frontend/src/styles.css). The host injects it at plugin
      // load time via `main.frontend.styles` in plugin.json — plugins must not
      // rely on classes happening to be in the host bundle.
      tailwindcss(),
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
      rollupOptions: {
        // Un-hashed asset names so plugin.json can reference style.css statically.
        output: { assetFileNames: '[name][extname]' },
      },
      outDir: join(dir, 'package', 'frontend'),
      emptyOutDir: true,
    },
  });
}
