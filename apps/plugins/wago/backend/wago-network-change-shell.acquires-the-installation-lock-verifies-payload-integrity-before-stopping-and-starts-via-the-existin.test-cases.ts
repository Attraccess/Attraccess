import * as fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { networkChangeShell } from './wago-network-change-shell';
import type { FixedMqttRecreationProgramAndDurableStateTestScope } from "./wago-network-change-shell.spec";
export function registerAcquiresTheInstallationLockVerifiesPayloadIntegrityBeforeStoppingAndStartsViaTheExistin(scope: FixedMqttRecreationProgramAndDurableStateTestScope): void {
it('acquires the installation lock, verifies payload integrity before stopping, and starts via the existing supervisor', () => {
    fs.rmSync(join(scope.fixture.root, 'var/lib/attraccess-wago-network-transaction'), { recursive: true });
    scope.fixture.file('etc/attraccess-wago/install.lock', '');
    scope.fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
    const input = Buffer.from(JSON.stringify(scope.payload)),
      digest = createHash('sha256').update(input).digest('hex');
    const script =
      `token=${'a'.repeat(32)}; digest=${digest}; bytes=${input.length};\n` + networkChangeShell('apply', scope.fixture.root);
    expect(spawnSync('/bin/sh', ['-n'], { input: script }).status).toBe(0);
    const result = scope.fixture.run(script, '', Buffer.from('invalid'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('MQTT payload size mismatch');
    expect(fs.existsSync(join(scope.fixture.root, 'docker.log'))).toBe(false);
    expect(script).toContain('timeout -k 5 310 flock 9');
    expect(script).toContain('launch_runtime_supervisor');
    expect(script).not.toContain('docker restart');
  });
}
