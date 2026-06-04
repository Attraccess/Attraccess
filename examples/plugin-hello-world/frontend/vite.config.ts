import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

// Builds the frontend plugin as a Vite module federation *remote*. The host
// loads it at runtime and pulls the exposed `./plugin` module.
//
// `shared` must list every host singleton the plugin *imports at runtime* so the
// plugin reuses the host's copy instead of bundling its own. The host shares
// (see apps/frontend/vite.config.ts): react, react-dom, react-router-dom,
// react-pluggable, @heroui/react, lucide-react, @tanstack/react-query.
//
// This example follows the recommended approach: it builds its UI from the
// host's own libraries — `@heroui/react` (components, themed) and `lucide-react`
// (icons) — so it looks native and inherits light/dark mode for free. Every
// shared package listed here is served from the host's single copy at runtime,
// so the plugin bundle only carries its own code. Sharing the router is what
// lets the plugin's <Link>s reuse the host navigation context.
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
        '@heroui/react': { singleton: true, requiredVersion: '*' },
        'lucide-react': { singleton: true, requiredVersion: '*' },
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
