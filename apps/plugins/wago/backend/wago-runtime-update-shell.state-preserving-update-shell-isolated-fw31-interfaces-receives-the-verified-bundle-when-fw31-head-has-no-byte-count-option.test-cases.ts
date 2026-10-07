import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesReceivesTheVerifiedBundleWhenFw31HeadHasNoByteCountOption(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('receives the verified bundle when FW31 head has no byte-count option', () => {
    rmSync(join(scope.fixture.root, 'bin/head'));
    scope.fixture.file('bin/head', '#!/bin/sh\necho "head: invalid option -- c" >&2\nexit 1\n', 0o700);
    scope.success(scope.stage());
  });
}
