import { spawnSync } from 'node:child_process';
import { managedHostHelper } from './wago-managed-helper';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DIN, WAGO_DOUT } from './wago-hardware-deployment';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerFixedManagedExecutorAndRecoveryProgramsExecutesAFullRepeatedImageUpdateThroughOnlyTheFixedDispatcherPreservingEnrolledStateS(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it.each(['native', 'terse'] as const)(
    'executes a full repeated image update through only the fixed dispatcher, preserving enrolled state (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('etc/attraccess-wago/runtime.env', 'WAGO_MQTT_PASSWORD=permanent-fixture-secret');
        fixture.file('etc/attraccess-wago/runtime-enabled', '');
        fixture.file('etc/attraccess-wago/install.lock', '');
        fixture.file('var/lib/attraccess-wago/state.json', 'enrolled-state');
        fixture.file(
          'owners.json',
          JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
        );
        fixture.setContainers([
          {
            id: 'old-id',
            name: 'attraccess-wago',
            running: true,
            restart: 'no',
            imageId: `sha256:${'9'.repeat(64)}`,
            mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
          },
        ]);
        fixture.file('loaded-image-id', scope.artifact.imageId);
        fixture.file('bundle/image-reference', scope.artifact.image + '\n');
        fixture.file('bundle/image.tar', 'compressed image fixture');
        const file = join(fixture.root, 'tmp/update.tar');
        expect(
          spawnSync('/usr/bin/tar', ['-cf', file, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
            .status,
        ).toBe(0);
        const bundle = readFileSync(file),
          digest = createHash('sha256').update(bundle).digest('hex');
        const helper = managedHostHelper(scope.artifact, fixture.root),
          token = '5'.repeat(32);
        const run = (header: string, bytes = Buffer.alloc(0)) =>
          fixture.run(helper, '', Buffer.concat([Buffer.from(header + '\n'), bytes]));
        const success = (result: ReturnType<typeof run>) =>
          expect({
            status: result.status,
            stderr: result.stderr,
            failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
          }).toEqual({ status: 0, stderr: '', failure: undefined });
        success(run(`proof ${token}`));
        expect(
          run(`stage ${token} ${digest} ${bundle.length} ${scope.artifact.imageId} arbitrary-image`).status,
        ).not.toBe(0);
        success(
          run(`stage ${token} ${digest} ${bundle.length} ${scope.artifact.imageId} ${scope.artifact.image}`, bundle),
        );
        expect(run(`activate ${'6'.repeat(32)}`).status).not.toBe(0);
        success(run(`activate ${token}`));
        success(run(`accept ${token}`));
        success(run(`acknowledge ${token}`));
        success(run(`acknowledge ${token}`));
        expect(fixture.read('var/lib/attraccess-wago/state.json')).toBe('enrolled-state');
        expect(fixture.read('etc/attraccess-wago/runtime.env')).toContain('permanent-fixture-secret');
        expect(fixture.containers()).toHaveLength(1);
        expect(fixture.containers()[0]).toMatchObject({ imageId: scope.artifact.imageId, running: true });
      } finally {
        fixture.dispose();
      }
    },
  );
}
