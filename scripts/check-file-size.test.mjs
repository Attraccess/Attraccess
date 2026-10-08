import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-file-size.mjs', import.meta.url));
const lines = (count, newline = '\n', trailing = true) =>
  Array(count).fill('// line').join(newline) + (trailing ? newline : '');

function repository(t, initial = {}) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'file-size-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), content);
  };
  git('init', '--quiet');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  write('README.md', 'Fixture\n');
  for (const [file, content] of Object.entries(initial)) write(file, content);
  const commit = () => {
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture');
  };
  commit();
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const checkFromCi = (base, ...args) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, NX_AFFECTED_BASE: base },
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  };
  return { cwd, git, write, commit, check: (...args) => checkFromCi('', ...args), checkFromCi };
}

function succeeds(result) {
  assert.equal(result.status, 0, result.output);
}

function fails(result, expected) {
  assert.equal(result.status, 1, result.output);
  assert.ok(result.output.includes(expected), result.output);
}

test('every maintained source language enforces the 600-line maximum', (t) => {
  const { git, write, check } = repository(t);
  const extensions = [
    'ts',
    'tsx',
    'mts',
    'cts',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'cpp',
    'hpp',
    'c',
    'h',
    'mm',
    'py',
    'sh',
    'sql',
    'scad',
    'css',
    'html',
    'mjml',
  ];
  for (const extension of extensions) write(`src/file.${extension}`, lines(600));
  write('src/types.d.ts', lines(600));
  write('vite.config.mts', lines(600));
  git('add', '.');
  succeeds(check());
  succeeds(check('--staged'));
  for (const extension of extensions) write(`src/file.${extension}`, lines(601));
  write('src/types.d.ts', lines(601));
  write('vite.config.mts', lines(601));
  git('add', '.');
  for (const mode of [[], ['--staged']]) {
    const result = check(...mode);
    for (const extension of extensions) fails(result, `"src/file.${extension}": 601 lines (maximum 600)`);
    fails(result, '"src/types.d.ts": 601 lines');
    fails(result, '"vite.config.mts": 601 lines');
  }
});

test('test names and test directories enforce a 1,000-line maximum', (t) => {
  const { git, write, check } = repository(t);
  const files = [
    'src/file.spec.mts',
    'src/file.test.tsx',
    'src/file.e2e.ts',
    'src/file.cy.ts',
    'test_browser.py',
    'reader_test.cpp',
    'scripts/check.spec.sh',
    'tests/main.cpp',
    'test/helper.ts',
    '__tests__/helper.ts',
    '__mocks__/helper.ts',
    'test-utils/helper.ts',
    'fixtures/host.cpp',
    'acceptance/plugin.ts',
    'e2e/browser.ts',
  ];
  for (const file of files) write(file, lines(1000));
  git('add', '.');
  succeeds(check());
  succeeds(check('--staged'));
  for (const file of files) write(file, lines(1001));
  git('add', '.');
  for (const mode of [[], ['--staged']]) {
    const result = check(...mode);
    for (const file of files) fails(result, `${JSON.stringify(file)}: 1001 lines (maximum 1000)`);
  }
});

test('LF, CRLF, CR, blank lines, comments, and missing final newlines count consistently', (t) => {
  const { write, check } = repository(t);
  write('empty.ts', '');
  for (const newline of ['\n', '\r\n', '\r']) {
    for (const trailing of [true, false]) {
      write('source.ts', lines(600, newline, trailing));
      succeeds(check());
      write('source.ts', lines(601, newline, trailing));
      fails(check(), '"source.ts": 601 lines');
    }
  }
  write('source.ts', '\n'.repeat(601));
  fails(check(), '"source.ts": 601 lines');
});

test('all committed code and tests fail until reduced below their limits in both views', (t) => {
  const { git, write, check } = repository(t, { 'code.ts': lines(700), 'code.test.ts': lines(1100) });
  for (const mode of [[], ['--staged']]) {
    fails(check(...mode), '"code.ts": 700 lines (maximum 600)');
    fails(check(...mode), '"code.test.ts": 1100 lines (maximum 1000)');
  }
  write('code.ts', lines(650));
  write('code.test.ts', lines(1050));
  git('add', '.');
  for (const mode of [[], ['--staged']]) {
    fails(check(...mode), '"code.ts": 650 lines (maximum 600)');
    fails(check(...mode), '"code.test.ts": 1050 lines (maximum 1000)');
  }
  write('code.ts', lines(600));
  write('code.test.ts', lines(1000));
  git('add', '.');
  succeeds(check());
  succeeds(check('--staged'));
});

test('new tracked and untracked files fail even after being committed', (t) => {
  const { git, write, commit, check } = repository(t);
  write('new.ts', lines(601));
  fails(check(), '"new.ts": 601 lines');
  git('add', 'new.ts');
  fails(check('--staged'), '"new.ts": 601 lines');
  commit();
  fails(check(), '"new.ts": 601 lines');
});

test('partially staged oversized content cannot hide behind a smaller working copy', (t) => {
  const { git, write, check } = repository(t, { 'code.ts': lines(600) });
  write('code.ts', lines(601));
  git('add', 'code.ts');
  write('code.ts', lines(600));
  succeeds(check());
  fails(check('--staged'), '"code.ts": 601 lines');
});

test('deletions pass and unchanged renames must meet the universal limit', (t) => {
  const { cwd, git, check } = repository(t, { 'code.ts': lines(700) });
  renameSync(path.join(cwd, 'code.ts'), path.join(cwd, 'renamed.ts'));
  fails(check(), '"renamed.ts": 700 lines');
  rmSync(path.join(cwd, 'renamed.ts'));
  git('add', '-u');
  succeeds(check());
  succeeds(check('--staged'));
});

test('non-code, ignored output, generated clients, and vendored runtime are excluded', (t) => {
  const { write, check } = repository(t, { '.gitignore': 'ignored/\n' });
  for (const file of [
    'README.md',
    'data.json',
    'workflow.yml',
    'CMakeLists.txt',
    'Dockerfile',
    'ignored/code.ts',
    'dist/code.ts',
    'build/code.cpp',
    'managed_components/component.c',
    'libs/api-client/src/generated/api.ts',
    'libs/react-query-client/src/lib/api.ts',
    'libs/companion-ws-client/src/lib/api.ts',
    'apps/frontend/public/openscad/openscad.wasm.js',
  ])
    write(file, lines(1000));
  succeeds(check());
  for (const file of [
    'apps/frontend/public/worker.js',
    'apps/frontend/public/openscad/adapter.js',
    'apps/attractap/firmware/src/display/images/logo_40h.hpp',
  ]) {
    write(file, lines(601));
    fails(check(), `${JSON.stringify(file)}: 601 lines`);
  }
});

test('spaces, tabs, Unicode, and newlines in filenames work in working-tree and staged modes', (t) => {
  const { git, write, check } = repository(t);
  const file = 'src/space \t ü\nname.ts';
  write(file, lines(601));
  fails(check(), JSON.stringify(file));
  git('add', '.');
  fails(check('--staged'), JSON.stringify(file));
});

test('target branch advancement cannot exempt unchanged oversized files', (t) => {
  const { git, write, commit, check } = repository(t, { 'code.ts': lines(700) });
  const original = git('rev-parse', 'HEAD');
  write('code.ts', lines(600));
  commit();
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '--quiet', '-b', 'topic', original);
  fails(check(), '"code.ts": 700 lines (maximum 600)');
  fails(check('--staged'), '"code.ts": 700 lines (maximum 600)');
});

test('missing target refs and Nx base variables have no effect; unsupported arguments fail', (t) => {
  const { git, check, checkFromCi } = repository(t);
  git('update-ref', '-d', 'refs/remotes/origin/main');
  succeeds(check());
  succeeds(check('--staged'));
  succeeds(checkFromCi('missing-ref'));
  succeeds(checkFromCi('missing-ref', '--staged'));
  fails(check('--base', 'HEAD'), 'Usage:');
  fails(check('--base'), 'Usage:');
  fails(check('--unknown'), 'Usage:');
});

test('an oversized working copy fails even when the index is compliant', (t) => {
  const { write, check } = repository(t, { 'code.ts': lines(600) });
  write('code.ts', lines(601));
  fails(check(), '"code.ts": 601 lines (maximum 600)');
  succeeds(check('--staged'));
});
