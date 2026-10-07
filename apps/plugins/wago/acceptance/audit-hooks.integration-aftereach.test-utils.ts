import { rm } from 'node:fs/promises';

import { AuditFixtureState } from './audit-hooks.integration-fixture.test-utils';
export async function AuditAfterEach(state: AuditFixtureState): Promise<void> {
  await state.app?.close();
  state.wago?.onModuleDestroy();
  await state.audit?.onModuleDestroy();
  if (state.db?.isInitialized) await state.db.destroy();
  await rm(state.directory, { recursive: true, force: true });
  jest.restoreAllMocks();
}
