import { loadConfig, type SidecarConfig } from '../config';

/** The service token the test harness configures. Not a secret, and never part of the sidecar build. */
export const TEST_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';

/** Test helper friendly defaults without reading the environment. */
export function configWith(overrides: Partial<SidecarConfig> = {}): SidecarConfig {
  return { ...loadConfig({ MATTER_SIDECAR_AUTH_TOKEN: TEST_TOKEN }), port: 0, ...overrides };
}
