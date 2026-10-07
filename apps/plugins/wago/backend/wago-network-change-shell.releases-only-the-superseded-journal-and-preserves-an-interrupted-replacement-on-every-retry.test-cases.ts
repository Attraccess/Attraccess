import * as fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { networkChangeShell } from './wago-network-change-shell';
import type { FixedMqttRecreationProgramAndDurableStateTestScope } from "./wago-network-change-shell.spec";
export function registerReleasesOnlyTheSupersededJournalAndPreservesAnInterruptedReplacementOnEveryRetry(scope: FixedMqttRecreationProgramAndDurableStateTestScope): void {
it('releases only the superseded journal and preserves an interrupted replacement on every retry', () => {
    const journal = 'var/lib/attraccess-wago-network-transaction';
    scope.fixture.file('etc/attraccess-wago/install.lock', '');
    scope.fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
    const previous = createHash('sha256').update(JSON.stringify(scope.payload)).digest('hex');
    const nextPayload = JSON.stringify({
      ...scope.payload,
      operationToken: 'e'.repeat(32),
      url: 'mqtt://corrected.test:1883',
    });
    const next = createHash('sha256').update(nextPayload).digest('hex');
    scope.fixture.file(`${journal}/digest`, previous);
    const release =
      `token=${'a'.repeat(32)}; digest=${previous}; bytes=${next};\n` + networkChangeShell('release', scope.fixture.root);
    for (let i = 0; i < 2; i++) {
      const result = scope.fixture.run(release);
      expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
        status: 0,
        stderr: '',
        stdout: 'OK\n',
      });
      expect(fs.existsSync(join(scope.fixture.root, journal))).toBe(false);
    }
    for (const [field, content] of Object.entries({
      digest: next,
      payload: nextPayload,
      'container.json': JSON.stringify([scope.original]),
      'ca-source': '/etc/attraccess-wago/runtime-ca.pem\n',
    }))
      scope.fixture.file(`${journal}/${field}`, content);
    for (let i = 0; i < 2; i++) {
      const result = scope.fixture.run(release);
      expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
        status: 0,
        stderr: '',
        stdout: 'OK\n',
      });
      expect(scope.fixture.read(`${journal}/payload`)).toBe(nextPayload);
    }
    scope.fixture.file(`${journal}/digest`, 'f'.repeat(64));
    expect(scope.fixture.run(release).status).not.toBe(0);
    expect(scope.fixture.read(`${journal}/payload`)).toBe(nextPayload);
  });
}
