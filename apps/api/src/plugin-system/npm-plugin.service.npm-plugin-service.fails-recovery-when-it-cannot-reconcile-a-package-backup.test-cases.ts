import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerFailsRecoveryWhenItCannotReconcileAPackageBackupCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('fails recovery when it cannot reconcile a package backup', async () => {
    writeFileSync(join(fixture.root, '.npm-backups'), 'not a directory');

    await expect(NpmPluginService.recoverBackups()).rejects.toThrow();
  });
}
