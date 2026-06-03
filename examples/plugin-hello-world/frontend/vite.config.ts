import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

// Builds the frontend plugin as a Vite module federation *remote*. The host
// loads it at runtime and pulls the exposed `./plugin` module.
//
// `shared` must list every host singleton the plugin *imports at runtime* so the
// plugin reuses the host's copy instead of bundling its own. The host shares
// (see apps/frontend/vite.config.ts): react, react-dom, react-router-dom,
// react-pluggable, @heroui/react, @tanstack/react-query. This example only
// renders plain React, so it shares just react + react-dom. Add the others here
// if your plugin imports them (e.g. @heroui/react for host-styled components).
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'plugin-hello-world',
      filename: 'remoteEntry.js',
      exposes: {
        './plugin': './src/plugin.tsx',
      },
      shared: ['react', 'react-dom'],
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
