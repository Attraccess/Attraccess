import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, type SidecarConfig } from '../config';

/** The service token the test harness configures. Not a secret, and never part of the sidecar build. */
export const TEST_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';

/**
 * Test helper friendly defaults without reading the environment. Each config gets its own storage directory below the
 * system temp directory, so test sidecars never share a fabric. It is created only by a sidecar that loads matter.js.
 */
export function configWith(overrides: Partial<SidecarConfig> = {}): SidecarConfig {
  return {
    ...loadConfig({ MATTER_SIDECAR_AUTH_TOKEN: TEST_TOKEN }),
    port: 0,
    storageDir: join(tmpdir(), `matter-sidecar-test-${randomUUID()}`),
    ...overrides,
  };
}
