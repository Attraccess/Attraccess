import type { INestApplicationContext } from '@nestjs/common';
import type { PreStartHook, ReaderUiProvider, SessionEndHook } from '@attraccess/plugins-backend-sdk';
import { ReaderUiRegistry } from '../plugin-system/reader-ui/reader-ui.registry';

export interface TestReaderUiScenario {
  readerUi?: ReaderUiProvider;
  preStartHook?: PreStartHook;
  sessionEndHook?: SessionEndHook;
}

/**
 * In-process reader UI provider for the real-API harness, where plugins stay disabled
 * (`DISABLE_PLUGINS=true`). The scenario object is read on every call, so a test can change what the
 * hook answers (allow, confirm, block, throw) between steps. Returns a function that removes it again.
 */
export function registerTestReaderUi(
  app: INestApplicationContext,
  scenario: TestReaderUiScenario,
  pluginName = 'test-hooks',
): { scenario: TestReaderUiScenario; unregister: () => void } {
  const registry = app.get(ReaderUiRegistry, { strict: false });
  registry.register(pluginName, {
    readerUi: scenario.readerUi && {
      getSlotContributions: (ctx) => (scenario.readerUi as ReaderUiProvider).getSlotContributions(ctx),
    },
    preStartHook: scenario.preStartHook && ((ctx) => (scenario.preStartHook as PreStartHook)(ctx)),
    sessionEndHook: scenario.sessionEndHook && ((ctx) => (scenario.sessionEndHook as SessionEndHook)(ctx)),
  });
  return { scenario, unregister: () => registry.unregister(pluginName) };
}
