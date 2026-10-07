import { rm } from 'node:fs/promises';
import { resetPluginAuditRegistry } from '../../../api/src/plugin-system/plugin-audit-registry';

import { AuditFixtureState } from './audit-hooks.integration-fixture.test-utils';
export async function AuditAfterAll(state: AuditFixtureState): Promise<void> {
  resetPluginAuditRegistry();
  await rm(state.schemaDirectory, { recursive: true, force: true });
}
