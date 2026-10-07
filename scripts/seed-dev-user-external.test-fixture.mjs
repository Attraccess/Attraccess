import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
export function registerExternalDatabaseRefusal(script) {
  test('refuses external databases without an explicit isolated-database override', () => {
    const result = spawnSync(process.execPath, [script, '--db', path.join(tmpdir(), 'not-authorized.sqlite')], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing to seed a database outside storage/);
  });
}
