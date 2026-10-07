import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesDoesNotChargeTheUnusedTemporaryFilesystemForADirectUpdateTransfer(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('does not charge the unused temporary filesystem for a direct update transfer', () => {
    scope.fixture.file(
      'bin/df',
      `#!/bin/sh\necho 'Filesystem 1024-blocks Used Available Capacity Mounted on'\ncase "$2" in */tmp) echo 'tmpfs 100 99 1 99% /tmp' ;; *) echo 'disk 999999 0 999999 0% /fixture' ;; esac\n`,
      0o700,
    );
    scope.success(scope.stage());
  });
}
