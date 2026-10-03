import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { generateInstallerAuthority, managedInstallerPublishScript, signInstaller } from './wago-managed-installer';
import { managedHostHelper } from './wago-managed-helper';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { spawn } from 'node:child_process';

describe('authenticated installer publication', () => {
  it('accepts only the server authority for this enrolment, replaces atomically, bounds stalled input, and preserves controller data', async () => {
    const fixture = fw31ShellFixture();
    const authority = generateInstallerAuthority(),
      token = 'a'.repeat(32);
    const artifact: BuildRuntimeArtifact = {
      buildId: 'a'.repeat(40),
      imageId: `sha256:${'b'.repeat(64)}`,
      digest: 'c'.repeat(64),
      bytes: 81920,
      image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'d'.repeat(64)}`,
      manifest: {
        schemaVersion: 1,
        runtime: 'attraccess-wago-cc100',
        runtimeVersion: '0.1.0',
        protocolVersion: '1.0.0',
        image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'d'.repeat(64)}`,
        hardware: {
          model: '751-9301',
          platform: 'linux/arm/v7',
          firmwareBaseline: '31',
          profile: 'cc100-751-9301-fw31-digital-rtu-v1',
        },
      },
    };
    const next = managedHostHelper(artifact, fixture.root),
      old = next + '# previous installer\n';
    expect(Buffer.byteLength(next)).toBeGreaterThan(750_000);
    fixture.file('etc/attraccess-wago/install.lock', '');
    fixture.file('etc/attraccess-wago-management/token', token);
    fixture.file('etc/attraccess-wago-management/installer-public.pem', authority.publicKey);
    fixture.file('usr/sbin/attraccess-wago-management', old, 0o700);
    fixture.file('etc/attraccess-wago/runtime.env', 'enrolled-secret-fixture');
    fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
    const program = (source: string, privateKey = authority.privateKey, signingToken = token) => {
      const digest = createHash('sha256').update(source).digest('hex');
      const signature = signInstaller(privateKey, signingToken, source);
      return `set -eu\numask 077\nPATH='${fixture.root}/bin'; export PATH\nroot='${fixture.root}'; config="$root/etc/attraccess-wago"\nfail() { exit 1; }\ntoken=${token}; digest=${digest}; bytes=${Buffer.byteLength(source)}; image='${signature}'; reference=''; previous=''\n${managedInstallerPublishScript(fixture.root)}`;
    };
    try {
      const other = generateInstallerAuthority();
      const tampered = next.replace('#!/bin/sh', '#!/bin/SH');
      for (const [script, source] of [
        [program(next, other.privateKey), next],
        [program(next, authority.privateKey, 'b'.repeat(32)), next],
        [
          program(tampered).replace(
            signInstaller(authority.privateKey, token, tampered),
            signInstaller(authority.privateKey, token, next),
          ),
          tampered,
        ],
      ]) {
        expect(fixture.run(script, '', Buffer.from(source)).status).not.toBe(0);
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(old);
      }
      fixture.file('var/lib/attraccess-wago-update-transaction/token', token);
      expect(fixture.run(program(next), '', Buffer.from(next)).status).not.toBe(0);
      rmSync(join(fixture.root, 'var/lib/attraccess-wago-update-transaction'), { recursive: true, force: true });
      // A live sender that never finishes must release the install lock without
      // replacing code. The timeout fixture scales the real host deadline only.
      fixture.file('tmp/stalled.sh', program(next));
      for (const [fault, input] of [
        ['installer-stalled', next.slice(0, 100)],
        ['installer-eof-stalled', next],
      ] as const) {
        const child = spawn('/bin/sh', [join(fixture.root, 'tmp/stalled.sh')], {
          env: {
            PATH: join(fixture.root, 'bin'),
            FIXTURE_ROOT: fixture.root,
            TMPDIR: join(fixture.root, 'tmp'),
            FAULT: fault,
          },
          stdio: ['pipe', 'ignore', 'ignore'],
          detached: true,
        });
        child.stdin.on('error', () => undefined);
        const stalled = new Promise((resolve) => child.once('close', resolve));
        const deadline = setTimeout(() => {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        }, 30_000).unref();
        child.stdin.write(input);
        try {
          expect(await stalled).not.toBe(0);
        } finally {
          clearTimeout(deadline);
          child.stdin.destroy();
        }
        expect(child.signalCode).toBeNull();
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(old);
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = fixture.run(program(next), attempt === 0 ? 'supervisor-lock-held' : '', Buffer.from(next));
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(next);
        expect(fixture.read('etc/attraccess-wago/runtime.env')).toBe('enrolled-secret-fixture');
      }
      expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/installer-private.pem'))).toBe(false);
    } finally {
      fixture.dispose();
    }
  }, 180_000);
});
