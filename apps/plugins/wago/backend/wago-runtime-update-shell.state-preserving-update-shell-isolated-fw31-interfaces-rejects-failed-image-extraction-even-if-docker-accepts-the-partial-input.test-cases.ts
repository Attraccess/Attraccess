import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsFailedImageExtractionEvenIfDockerAcceptsThePartialInput(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('rejects failed image extraction even if Docker accepts the partial input', () => {
    scope.fixture.file(
      'bin/tar',
      '#!/bin/sh\nif [ "$1" = --version ]; then echo "GNU tar fixture"; exit 0; fi\ncase "$*" in *image.tar*) printf partial; exit 1 ;; esac\nshift 2\nexec /usr/bin/tar "$@"\n',
      0o700,
    );
    expect(scope.stage().status).not.toBe(0);
    expect(scope.fixture.containers()[0]).toMatchObject({ running: true, imageId: scope.previousImageId });
  });
}
