import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildInfoFor, checks, checksFor, projectFor, requiredGenerated, run } from './typecheck-staged.mjs';

const workspace = path.resolve(import.meta.dirname, '..');

test('staged TypeScript files map to the project that owns them', () => {
  assert.equal(projectFor('apps/frontend/src/main.tsx'), 'apps/frontend');
  assert.equal(projectFor('apps/plugins/matter/backend/plugin.ts'), 'apps/plugins/matter');
  assert.equal(projectFor('apps/matter-sidecar/src/main.mts'), 'apps/matter-sidecar');
  assert.equal(projectFor('apps/frontend/src/vite-env.d.ts'), null);
  assert.equal(projectFor('apps/frontend/src/style.css'), null);
  assert.equal(projectFor('libs/react-query-client/src/lib/queries/index.ts'), null);
  assert.equal(projectFor('apps/plugins/shelly/backend/plugin.ts'), null);
  assert.equal(projectFor('apps/frontendx/src/main.ts'), null);
});

test('each owning project runs its checks once', () => {
  const files = ['apps/frontend/src/a.ts', 'apps/frontend/src/b.spec.ts', 'libs/ui/src/c.tsx', 'README.md'];
  assert.deepEqual(checksFor(files), [...checks['apps/frontend'], ...checks['libs/ui']]);
  assert.deepEqual(checksFor(['docs/index.md']), []);
});

test('build info is kept per tsconfig', () => {
  assert.equal(
    buildInfoFor(['-p', 'apps/frontend/tsconfig.app.json']),
    'node_modules/.cache/precommit-typecheck/apps__frontend__tsconfig.app.json.tsbuildinfo',
  );
});

function harness(overrides = {}) {
  const calls = [];
  const logs = [];
  const status = run({
    files: ['libs/ui/src/button.tsx'],
    exists: () => true,
    typecheck: (args) => calls.push(args) && true,
    log: (message) => logs.push(message),
    ...overrides,
  });
  return { status, calls, logs };
}

test('run passes when every check passes', () => {
  const { status, calls, logs } = harness();
  assert.equal(status, 0);
  assert.deepEqual(calls, checks['libs/ui']);
  assert.match(logs.join('\n'), /Typecheck passed \(libs\/ui\/tsconfig\.lib\.json\)/);
});

test('run fails and names the failed tsconfig', () => {
  const { status, logs } = harness({
    files: ['apps/frontend/src/a.ts'],
    typecheck: (args) => !args[1].endsWith('spec.json'),
  });
  assert.equal(status, 1);
  assert.match(logs.join('\n'), /Typecheck failed for apps\/frontend\/tsconfig\.spec\.json\./);
});

test('run does nothing without TypeScript changes in a checked project', () => {
  const { status, calls, logs } = harness({ files: ['docs/index.md'] });
  assert.equal(status, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(logs, []);
});

test('run skips with a notice when generated clients are missing', () => {
  const { status, calls, logs } = harness({ exists: (file) => file !== requiredGenerated[0] });
  assert.equal(status, 0);
  assert.deepEqual(calls, []);
  assert.match(
    logs.join('\n'),
    /Skipping typecheck: generated clients are missing \(libs\/react-query-client\/src\/lib\)/,
  );
});

test('every listed tsconfig exists', () => {
  for (const args of Object.values(checks).flat()) assert.ok(existsSync(path.join(workspace, args[1])), args[1]);
});

function tscCommands(target) {
  const { command, commands = [command] } = target.options ?? {};
  return commands
    .flatMap((entry) => (typeof entry === 'string' ? entry : entry.command).split('&&'))
    .map((entry) => entry.trim().replace(/^pnpm exec /, ''))
    .filter((entry) => entry.startsWith('tsc '));
}

function tscArgs(command, cwd = '.') {
  const words = command.split(/\s+/).slice(1);
  const index = words.indexOf('-p');
  const rest = words.filter((word, i) => word !== '--noEmit' && i !== index && i !== index + 1);
  return ['-p', path.posix.join(cwd, words[index + 1]), ...rest];
}

function expectedChecks(nodes) {
  // The API is built by webpack (NxAppWebpackPlugin, compiler 'tsc'), which type-checks this config.
  const expected = { 'apps/api': [['-p', 'apps/api/tsconfig.app.json']] };
  for (const [name, { data }] of Object.entries(nodes)) {
    if (name === 'companion' || name === 'companion-ws-client') continue;
    const targets = data.targets ?? {};
    const found = ['typecheck', 'typecheck-tests'].flatMap((key) =>
      targets[key] ? tscCommands(targets[key]).map((command) => tscArgs(command, targets[key].options.cwd)) : [],
    );
    for (const target of Object.values(targets)) {
      if (target.executor === '@nx/js:tsc') found.push(['-p', target.options.tsConfig]);
    }
    if (found.length) expected[data.root] = [...new Map(found.map((args) => [args.join(' '), args])).values()];
  }
  return expected;
}

const sorted = (map) =>
  Object.fromEntries(
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([root, list]) => [root, list.map((args) => args.join(' ')).sort()]),
  );

test('the checks match the tsc commands of the Nx typecheck and build targets', { timeout: 120000 }, () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'typecheck-staged-'));
  try {
    const file = path.join(directory, 'graph.json');
    execFileSync('pnpm', ['exec', 'nx', 'graph', `--file=${file}`], { cwd: workspace, stdio: 'ignore' });
    const { nodes } = JSON.parse(readFileSync(file, 'utf8')).graph;
    assert.deepEqual(sorted(checks), sorted(expectedChecks(nodes)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
