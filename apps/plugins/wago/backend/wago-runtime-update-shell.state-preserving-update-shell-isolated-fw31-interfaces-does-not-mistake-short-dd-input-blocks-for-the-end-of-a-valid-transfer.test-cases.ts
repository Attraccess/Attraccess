import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesDoesNotMistakeShortDdInputBlocksForTheEndOfAValidTransfer(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('does not mistake short dd input blocks for the end of a valid transfer', () => {
    rmSync(join(scope.fixture.root, 'bin/dd'));
    scope.fixture.file(
      'bin/dd',
      '#!/bin/sh\ncase "$1" in bs=1) if test "$2" = count=8193 && test -e "$FIXTURE_ROOT/var/lib/attraccess-wago-update-transaction/bundle.tar"; then echo capture >> "$FIXTURE_ROOT/receiver-metadata-captures.log"; fi; exec /bin/dd "$@" ;; esac\nsize=${1#bs=}\nif test "$size" -gt 256 && test "$2" = count=1; then exec /bin/dd bs=256 count=1; fi\nexec /bin/dd "$@"\n',
      0o700,
    );
    scope.success(scope.stage());
    // Full guarded metadata capture is needed for final validation, not for
    // every short input block of an 80 MiB transfer.
    expect(scope.fixture.read('receiver-metadata-captures.log').trim().split('\n')).toHaveLength(1);
  });
}
