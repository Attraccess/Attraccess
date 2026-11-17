import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { copyAssets } from '../../tools/vite/copy-assets.plugin';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/ui',
  plugins: [
    react(),
    copyAssets(['*.md', { input: 'src', glob: 'tokens.css', output: '.' }]),
    dts({ entryRoot: 'src', tsconfigPath: path.join(__dirname, 'tsconfig.lib.json') }),
  ],
  build: {
    outDir: '../../dist/libs/ui',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      entry: 'src/index.ts',
      name: 'ui',
      fileName: 'index',
      formats: ['es'],
    },
    rolldownOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@heroui/react', 'lucide-react'],
    },
  },
});
