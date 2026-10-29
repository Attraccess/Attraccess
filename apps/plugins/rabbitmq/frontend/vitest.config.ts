import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@attraccess/shared': fileURLToPath(new URL('../../../../libs/shared/src/index.ts', import.meta.url)),
      '@attraccess/plugins-frontend-ui': fileURLToPath(
        new URL('../../../../libs/plugins-frontend-ui/src/index.ts', import.meta.url),
      ),
      '@attraccess/react-query-client': fileURLToPath(
        new URL('../../scripts/react-query-client.test-stub.ts', import.meta.url),
      ),
      '@attraccess/plugins-frontend-sdk': fileURLToPath(
        new URL('../../../../libs/plugins-frontend-sdk/src/lib/frontend.api-client.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'jsdom', include: ['apps/plugins/rabbitmq/frontend/src/**/*.test.tsx'] },
});
