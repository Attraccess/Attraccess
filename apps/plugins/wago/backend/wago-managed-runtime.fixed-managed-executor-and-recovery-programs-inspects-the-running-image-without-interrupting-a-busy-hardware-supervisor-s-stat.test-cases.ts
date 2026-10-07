import { managedHostHelper } from './wago-managed-helper';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerFixedManagedExecutorAndRecoveryProgramsInspectsTheRunningImageWithoutInterruptingABusyHardwareSupervisorSStat(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it.each(['native', 'terse'] as const)(
    'inspects the running image without interrupting a busy hardware supervisor (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
        fixture.file('etc/attraccess-wago/install.lock', '');
        const helper = managedHostHelper(scope.artifact, fixture.root);
        fixture.file('usr/sbin/attraccess-wago-management', helper, 0o700);
        const containers = JSON.stringify([
          { id: 'a'.repeat(64), name: 'attraccess-wago', imageId: scope.artifact.imageId, running: true },
        ]);
        fixture.file('containers.json', containers);
        const result = fixture.run(helper, 'supervisor-lock-held', Buffer.from(`inspect ${'a'.repeat(32)}\n`));
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toMatch(
          new RegExp(`^${MANAGED_HELPER_PROTOCOL}\\n[a-f0-9]{64}\\n${scope.artifact.imageId} true\\n$`),
        );
        expect(fixture.read('containers.json')).toBe(containers);
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
      } finally {
        fixture.dispose();
      }
    },
  );
}
