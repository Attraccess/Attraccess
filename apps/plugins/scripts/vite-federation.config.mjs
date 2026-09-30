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
import { fileURLToPath } from 'node:url';

// Vite bundles this config to CJS, which wraps the ESM default export.
const tailwindcss = tailwindcssImport.default ?? tailwindcssImport;

// Every host singleton a plugin may import at runtime. Sharing them keeps the
// plugin bundle small and guarantees a single, host-themed instance.
// Remote-only: federation transform emits shared chunks even with generate:false,
// then generateBundle discards them. Resolve all seven to an inert build entry.
// Never reuse this config for a host: packagePath suppresses host version detection.
const hostOnly = {
  singleton: true,
  requiredVersion: '*',
  import: false,
  generate: false,
  packagePath: fileURLToPath(new URL('./host-shared-placeholder.mjs', import.meta.url)),
};
export const HOST_SHARED = {
  react: { ...hostOnly },
  'react-dom': { ...hostOnly },
  'react-router-dom': { ...hostOnly },
  '@heroui/react': { ...hostOnly },
  'lucide-react': { ...hostOnly },
  '@tanstack/react-query': { ...hostOnly },
  // Includes the core language store: a remote must never create its own copy.
  '@attraccess/plugins-frontend-ui': { ...hostOnly },
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
