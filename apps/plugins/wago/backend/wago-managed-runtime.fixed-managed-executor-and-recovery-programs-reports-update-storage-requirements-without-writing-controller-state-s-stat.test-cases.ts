import { managedHostHelper } from './wago-managed-helper';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerFixedManagedExecutorAndRecoveryProgramsReportsUpdateStorageRequirementsWithoutWritingControllerStateSStat(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it.each(['native', 'terse'] as const)(
    'reports update storage requirements without writing controller state (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('etc/attraccess-wago/install.lock', '');
        fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
        const containers = fixture.read('containers.json');
        const result = fixture.run(
          managedHostHelper(scope.artifact, fixture.root),
          'supervisor-lock-held',
          Buffer.from(`storage-status ${'a'.repeat(32)}\n`),
        );
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toBe(
          ['/var/lib', '/var/lib'].map((path) => `${fixture.root}${path} 999999 16704 disk /fixture\n`).join(''),
        );
        expect(fixture.read('containers.json')).toBe(containers);
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-update-transaction'))).toBe(false);
        expect(
          fixture.run(
            managedHostHelper(scope.artifact, fixture.root),
            '',
            Buffer.from(`storage-status ${'b'.repeat(32)}\n`),
          ).status,
        ).not.toBe(0);
        rmSync(join(fixture.root, 'etc/attraccess-wago'), { recursive: true });
        expect(
          fixture.run(
            managedHostHelper(scope.artifact, fixture.root),
            '',
            Buffer.from(`storage-status ${'a'.repeat(32)}\n`),
          ).status,
        ).not.toBe(0);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago'))).toBe(false);
      } finally {
        fixture.dispose();
      }
    },
  );
}
