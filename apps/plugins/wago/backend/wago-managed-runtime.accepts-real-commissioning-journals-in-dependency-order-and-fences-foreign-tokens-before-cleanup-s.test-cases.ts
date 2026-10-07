import { spawnSync } from 'node:child_process';
import { commissioningAcceptanceScript } from './wago-commissioning-accept';
import { managedHostHelper } from './wago-managed-helper';
import { managedWatchdogScript } from './wago-managed-provision';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeBundleDeliveryScript } from './wago-runtime-install';
import type { FixedManagedExecutorAndRecoveryProgramsTestScope } from "./wago-managed-runtime.spec";
export function registerAcceptsRealCommissioningJournalsInDependencyOrderAndFencesForeignTokensBeforeCleanupS(scope: FixedManagedExecutorAndRecoveryProgramsTestScope): void {
it.each(['', 'supervisor-lock-held', 'bootstrap-refresh'])(
    'accepts real commissioning journals in dependency order and fences foreign tokens before cleanup (%s)',
    (lockState) => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      const token = 'a'.repeat(32);
      const success = (result: ReturnType<typeof fixture.run>) =>
        expect({
          status: result.status,
          stderr: result.stderr,
          failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
        }).toEqual({ status: 0, stderr: '', failure: undefined });
      fixture.file('bundle/image-reference', scope.artifact.image + '\n');
      fixture.file('bundle/image.tar', 'compressed fixture image');
      const archive = join(fixture.root, 'tmp/install.tar');
      expect(
        spawnSync('/usr/bin/tar', ['-cf', archive, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
          .status,
      ).toBe(0);
      const bundle = readFileSync(archive);
      fixture.file('etc/attraccess-wago/docker-provision/token', token + '\n');
      fixture.file('etc/attraccess-wago/docker-provision/mode', 'destructive\n');
      fixture.file('etc/attraccess-wago/docker-provision/started', '');
      success(
        fixture.run(
          runtimeBundleDeliveryScript(
            scope.artifact.image,
            'MQTT=permanent',
            null,
            bundle.length,
            createHash('sha256').update(bundle).digest('hex'),
            token,
            fixture.root,
          ),
          '',
          bundle,
        ),
      );
      const helper = managedHostHelper(scope.artifact, fixture.root);
      const management = { token: 'c'.repeat(32), helper, watchdog: managedWatchdogScript(fixture.root) };
      if (lockState === 'bootstrap-refresh') {
        fixture.file('etc/attraccess-wago-management/token', management.token + '\n');
        fixture.file('etc/attraccess-wago-management/watchdog', '#!/bin/sh\nexit 43\n', 0o700);
        fixture.file('usr/sbin/attraccess-wago-management', '#!/bin/sh\nexit 42\n', 0o700);
        expect(fixture.run(commissioningAcceptanceScript(token, fixture.root, false, { ...management, token: 'd'.repeat(32) })).status).not.toBe(0);
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
        expect(fixture.read('etc/attraccess-wago-management/watchdog')).toContain('exit 43');
      }
      const acceptance = lockState === 'bootstrap-refresh'
        ? commissioningAcceptanceScript(token, fixture.root, false, management)
        : helper;
      const input = lockState === 'bootstrap-refresh' ? undefined : Buffer.from(`commissioning-accept ${token}\n`);
      expect(fixture.run(helper, '', Buffer.from(`commissioning-accept ${'b'.repeat(32)}\n`)).status).not.toBe(0);
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
      const bounded = fixture.run(acceptance, 'lock-wait-expired', input);
      expect(bounded.status).not.toBe(0);
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
      success(fixture.run(acceptance, lockState, input));
      if (lockState === 'bootstrap-refresh') {
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
        expect(fixture.read('etc/attraccess-wago-management/watchdog')).toBe(management.watchdog);
      }
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction'))).toBe(false);
      expect(existsSync(join(fixture.root, `etc/attraccess-wago/docker-provision.completed-${token}/accepted`))).toBe(
        true,
      );
      success(fixture.run(helper, '', Buffer.from(`commissioning-accept ${token}\n`)));
      expect(fixture.containers()[0]).toMatchObject({ running: true });
      expect(fixture.read('etc/attraccess-wago/runtime.env')).toBe('MQTT=permanent');
    } finally {
      fixture.dispose();
    }
  });
}
