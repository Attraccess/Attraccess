import { execFileSync } from 'node:child_process';
import { expect, test } from 'vitest';
const script = new URL('../hil-changes.sh', import.meta.url).pathname;
test('missing/unresolvable base fails closed instead of reporting unaffected', () => {
  expect(() => execFileSync('bash', [script, 'not-a-real-base-sha'], { stdio: 'pipe' })).toThrow();
  expect(() => execFileSync('bash', [script], { stdio: 'pipe' })).toThrow();
});
test('unchanged HEAD reports that hardware is not required', () => {
  expect(execFileSync('bash', [script, 'HEAD'], { encoding: 'utf8' }).trim()).toBe('false');
});
