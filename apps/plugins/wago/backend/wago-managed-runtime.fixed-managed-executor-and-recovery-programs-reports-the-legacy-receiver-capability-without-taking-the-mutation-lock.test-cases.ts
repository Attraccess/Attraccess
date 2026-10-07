import { managedHostHelper } from './wago-managed-helper';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerFixedManagedExecutorAndRecoveryProgramsReportsTheLegacyReceiverCapabilityWithoutTakingTheMutationLock(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it('reports the legacy receiver capability without taking the mutation lock', () => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
      const request = Buffer.from(`receiver-status ${'a'.repeat(32)}\n`);
      const helper = managedHostHelper(scope.artifact, fixture.root);
      expect(fixture.run(helper, 'supervisor-lock-held', request).stdout).toBe('head-byte-count supported\n');
      rmSync(join(fixture.root, 'bin/head'));
      fixture.file('bin/head', '#!/bin/sh\nexit 1\n', 0o700);
      const unsupported = fixture.run(helper, 'supervisor-lock-held', request);
      expect({ status: unsupported.status, stdout: unsupported.stdout, stderr: unsupported.stderr }).toEqual({
        status: 0,
        stdout: 'head-byte-count unsupported\n',
        stderr: '',
      });
      expect(fixture.run(helper, '', Buffer.from(`receiver-status ${'b'.repeat(32)}\n`)).status).not.toBe(0);
    } finally {
      fixture.dispose();
    }
  });
}
