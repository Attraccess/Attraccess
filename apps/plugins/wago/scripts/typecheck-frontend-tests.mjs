import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const environment = { ...process.env };
delete environment.FORCE_COLOR;
const require = createRequire(import.meta.url);
const tsc = resolve(dirname(require.resolve('typescript/package.json')), require('typescript/package.json').bin.tsc);
const result = spawnSync(
  process.execPath,
  [tsc, '--noEmit', '--pretty', 'false', '-p', 'apps/plugins/wago/frontend/tsconfig.tests.json'],
  { encoding: 'utf8', env: environment },
);
if (result.error) throw result.error;
if (result.signal) throw new Error(`Frontend tsc terminated by ${result.signal}`);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replaceAll('\r\n', '\n');
// No diagnostic is whitelisted: the historical commissioning-modal baseline was
// fixed at the source, so every TypeScript diagnostic in the test sources fails this gate.
const known = [];
let remaining = output;
let count = 0;
for (const diagnostic of known) {
  if (remaining.includes(diagnostic)) {
    remaining = remaining.replace(diagnostic, '');
    count++;
  }
}
if (remaining.trim() || (result.status !== 0 && count === 0)) {
  process.stderr.write(output);
  process.exitCode = result.status || 1;
} else {
  process.stdout.write(
    `Raw frontend test tsc exit: ${result.status}; commissioning baseline accepted ${count} known diagnostics and no others.\n`,
  );
  if (count) process.stdout.write(output);
}
