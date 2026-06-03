import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

// Builds the frontend plugin as a Vite module federation *remote*. The host
// loads it at runtime and pulls the exposed `./plugin` module.
//
// `shared` must list every host singleton the plugin *imports at runtime* so the
// plugin reuses the host's copy instead of bundling its own. The host shares
// (see apps/frontend/vite.config.ts): react, react-dom, react-router-dom,
// react-pluggable, @heroui/react, @tanstack/react-query. This example renders
// plain React and uses the host's router for in-plugin links, so it shares
// react + react-dom + react-router-dom. Add the others here if your plugin
// imports them (e.g. @heroui/react for host-styled components). Sharing the
// router is what lets the plugin's <Link>s reuse the host navigation context.
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'plugin-hello-world',
      filename: 'remoteEntry.js',
      exposes: {
        './plugin': './src/plugin.tsx',
      },
      // Object form with requiredVersion '*' mirrors the host (see
      // apps/frontend/vite.config.ts): the plugin accepts whatever version the
      // host shares instead of pinning its own, so React stays a single
      // instance. A version mismatch here yields two Reacts → "Invalid hook
      // call" at runtime.
      shared: {
        react: { singleton: true, requiredVersion: '*' },
        'react-dom': { singleton: true, requiredVersion: '*' },
        'react-router-dom': { singleton: true, requiredVersion: '*' },
      },
    }),
  ],
  build: {
    // Required by module federation: emit modern ESM and keep names intact.
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    // Emit remoteEntry.js and its chunks at the output root (not assets/) so the
    // manifest entryPoint "remoteEntry.js" resolves directly.
    assetsDir: '',
  },
});
