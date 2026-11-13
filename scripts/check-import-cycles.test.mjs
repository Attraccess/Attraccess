import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-import-cycles.mjs', import.meta.url));
const tsconfig = JSON.stringify({
  compilerOptions: {
    moduleResolution: 'bundler',
    module: 'esnext',
    paths: { '@attraccess/shared': ['./libs/shared/src/index.ts'] },
  },
});

function repository(t, files = {}) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'import-cycles-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = fixtureGitEnv();
  const git = (...args) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), content);
  };
  git('init', '--quiet');
  write('tsconfig.base.json', tsconfig);
  for (const [file, content] of Object.entries(files)) write(file, content);
  const check = (...args) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  };
  return { git, write, check };
}

function succeeds(result) {
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Import cycle check passed/);
}

function fails(result, ...chain) {
  assert.equal(result.status, 1, result.output);
  assert.ok(result.output.includes(chain.join('\n  -> ')), result.output);
}

test('a two-file runtime cycle fails and is printed as a file chain', (t) => {
  const { check } = repository(t, {
    'apps/web/src/a.ts': "import { b } from './b';\nexport const a = () => b;\n",
    'apps/web/src/b.tsx': "import { a } from './a';\nexport const b = () => a;\n",
  });
  fails(check(), 'apps/web/src/a.ts', 'apps/web/src/b.tsx', 'apps/web/src/a.ts');
});

test('side-effect imports, re-exports, import-equals and top-level require count as runtime edges', (t) => {
  for (const back of [
    "import './a';\n",
    "export { a } from './a';\n",
    "export * from './a';\n",
    "import a = require('./a');\n",
    "const { a } = require('./a');\n",
    "require('./a');\n",
  ]) {
    const { check } = repository(t, {
      'apps/web/src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'apps/web/src/b.ts': `${back}export const b = 1;\n`,
    });
    fails(check(), 'apps/web/src/a.ts', 'apps/web/src/b.ts', 'apps/web/src/a.ts');
  }
});

test('type-only imports and exports never form a cycle', (t) => {
  for (const back of [
    "import type { A } from './a';\nexport type B = A;\n",
    "import { type A } from './a';\nexport type B = A;\n",
    "import { type A, type C } from './a';\nexport type B = A | C;\n",
    "export type { A } from './a';\n",
    "export { type A } from './a';\n",
    "import type * as a from './a';\nexport type B = a.A;\n",
    "const lazy = () => import('./a');\nexport { lazy };\n",
    "export const lazy = () => require('./a').a;\n",
  ]) {
    const { check } = repository(t, {
      'apps/web/src/a.ts':
        "import { b } from './b';\nexport type A = string;\nexport type C = number;\nexport const a = b;\n",
      'apps/web/src/b.ts': `${back}export const b = 1;\n`,
    });
    succeeds(check());
  }
});

test('a default import beside an inline type specifier is still a runtime edge', (t) => {
  const { check } = repository(t, {
    'apps/web/src/a.ts': "import { b } from './b';\nexport type A = string;\nexport default b;\n",
    'apps/web/src/b.ts': "import a, { type A } from './a';\nexport const b: A = String(a);\n",
  });
  fails(check(), 'apps/web/src/a.ts', 'apps/web/src/b.ts', 'apps/web/src/a.ts');
});

test('a named runtime specifier beside an inline type specifier is still a runtime edge', (t) => {
  for (const back of [
    "import { type A, a } from './a';\nexport const b = a;\n",
    "export { type A, a } from './a';\n",
  ]) {
    const { check } = repository(t, {
      'apps/web/src/a.ts': "import { b } from './b';\nexport type A = string;\nexport const a = b;\n",
      'apps/web/src/b.ts': `${back}export const c = 1;\n`,
    });
    fails(check(), 'apps/web/src/a.ts', 'apps/web/src/b.ts', 'apps/web/src/a.ts');
  }
});

test('cycles through @attraccess path aliases are detected', (t) => {
  const { check } = repository(t, {
    'libs/shared/src/index.ts': "export * from './lib/util';\n",
    'libs/shared/src/lib/util.ts': "import { app } from '../../../../apps/web/src/app';\nexport const util = app;\n",
    'apps/web/src/app.ts': "import { util } from '@attraccess/shared';\nexport const app = () => util;\n",
  });
  fails(
    check(),
    'apps/web/src/app.ts',
    'libs/shared/src/index.ts',
    'libs/shared/src/lib/util.ts',
    'apps/web/src/app.ts',
  );
});

test('entity-only cycles are exempt, but a cycle through any other file is reported', (t) => {
  const entities = 'libs/database-entities/src/lib/entities';
  const { write, check } = repository(t, {
    [`${entities}/user.entity.ts`]:
      "import { Project } from './project';\n@Entity()\nexport class User { p = () => Project; }\n",
    [`${entities}/project.ts`]:
      "import { User } from './user.entity';\n@Entity()\nexport class Project { u = () => User; }\n",
  });
  succeeds(check());
  write(
    `${entities}/project.ts`,
    "import { User } from './user.entity';\nimport '../helper';\n@Entity()\nexport class Project {}\n",
  );
  write('libs/database-entities/src/lib/helper.ts', "import './entities/user.entity';\n");
  const result = check();
  fails(
    result,
    'libs/database-entities/src/lib/entities/project.ts',
    'libs/database-entities/src/lib/helper.ts',
    'libs/database-entities/src/lib/entities/user.entity.ts',
    'libs/database-entities/src/lib/entities/project.ts',
  );
});

test('a helper in the entities directory is not exempt just because of its location', (t) => {
  const entities = 'libs/database-entities/src/lib/entities';
  const { check } = repository(t, {
    [`${entities}/node.entity.ts`]:
      "import { schema } from './schemas';\n@Entity()\nexport class Node { s = schema; }\n",
    [`${entities}/schemas.ts`]: "import { Node } from './node.entity';\nexport const schema = () => Node;\n",
  });
  fails(check(), `${entities}/node.entity.ts`, `${entities}/schemas.ts`, `${entities}/node.entity.ts`);
});

test('a spec in the entities directory is never exempt', (t) => {
  const entities = 'libs/database-entities/src/lib/entities';
  const { check } = repository(t, {
    [`${entities}/user.entity.ts`]: "import './user.entity.spec';\n@Entity()\nexport class User {}\n",
    [`${entities}/user.entity.spec.ts`]:
      "import { User } from './user.entity';\n// @Entity()\nexport const u = User;\n",
  });
  fails(check(), `${entities}/user.entity.spec.ts`, `${entities}/user.entity.ts`, `${entities}/user.entity.spec.ts`);
});

test('generated code, declaration files and files outside apps and libs are ignored', (t) => {
  const { check } = repository(t, {
    'libs/react-query-client/src/lib/a.ts': "import './b';\n",
    'libs/react-query-client/src/lib/b.ts': "import './a';\n",
    'libs/companion-ws-client/src/lib/a.ts': "import './b';\n",
    'libs/companion-ws-client/src/lib/b.ts': "import './a';\n",
    'apps/web/dist/a.ts': "import './b';\n",
    'apps/web/dist/b.ts': "import './a';\n",
    'apps/web/build/a.ts': "import './b';\n",
    'apps/web/build/b.ts': "import './a';\n",
    'apps/fw/managed_components/a.ts': "import './b';\n",
    'apps/fw/managed_components/b.ts': "import './a';\n",
    'apps/web/.nx/a.ts': "import './b';\n",
    'apps/web/.nx/b.ts': "import './a';\n",
    'apps/web/src/generated/a.ts': "import './b';\n",
    'apps/web/src/generated/b.ts': "import './a';\n",
    'apps/web/src/types.d.ts': "import './other';\n",
    'apps/web/src/other.ts': "import './types';\n",
    'tools/a.ts': "import './b';\n",
    'tools/b.ts': "import './a';\n",
  });
  succeeds(check());
});

test('--staged checks the index, not the working tree', (t) => {
  const { git, write, check } = repository(t, {
    'apps/web/src/a.ts': "import './b';\n",
    'apps/web/src/b.ts': 'export const b = 1;\n',
  });
  git('add', '.');
  write('apps/web/src/b.ts', "import './a';\n");
  fails(check(), 'apps/web/src/a.ts', 'apps/web/src/b.ts', 'apps/web/src/a.ts');
  succeeds(check('--staged'));
  git('add', '.');
  write('apps/web/src/b.ts', 'export const b = 1;\n');
  succeeds(check());
  fails(check('--staged'), 'apps/web/src/a.ts', 'apps/web/src/b.ts', 'apps/web/src/a.ts');
});
