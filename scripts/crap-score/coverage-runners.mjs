import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { workspace } from './project-sources.mjs';

export function nodeCoverage(files, tests, output) {
  if (!tests.length) return [];
  mkdirSync(output, { recursive: true });
  const manifest = path.join(output, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ files: files.map((file) => path.resolve(workspace, file)), output }));
  const loader = path.join(workspace, 'scripts/crap-score/node-coverage.mjs');
  const env = {
    ...process.env,
    CRAP_NODE_MANIFEST: manifest,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${loader}`,
  };
  delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath, ['--test', ...tests], {
    cwd: workspace,
    stdio: 'inherit',
    env,
  });
  const reports = readdirSync(output).filter((file) => file !== 'manifest.json' && file.endsWith('.json'));
  if (!reports.length) throw new Error('Node test runner did not produce coverage');
  return reports.map((file) => JSON.parse(readFileSync(path.join(output, file), 'utf8')));
}

export const vitestSuites = {
  '.': [{ cwd: workspace, args: ['--config', 'scripts/crap-score/vitest.config.mts'] }],
  'apps/companion': [{ cwd: workspace, args: ['--config', 'apps/companion/renderer/vitest.config.mts'] }],
  'apps/frontend': [{ cwd: workspace, args: ['--config', 'apps/frontend/vitest.config.ts'] }],
  'apps/plugins/wago': [{ cwd: workspace, args: ['--config', 'apps/plugins/wago/frontend/vitest.config.mts'] }],
  'apps/plugins/rabbitmq': [{ cwd: workspace, args: ['--config', 'apps/plugins/rabbitmq/frontend/vitest.config.ts'] }],
  'apps/plugins/shelly': [{ cwd: path.join(workspace, 'apps/plugins/shelly'), args: ['--root', 'frontend'] }],
  ...Object.fromEntries(
    ['libs/plugins-frontend-sdk', 'libs/plugins-frontend-ui', 'libs/companion-ws-client'].map((root) => [
      root,
      [{ cwd: path.join(workspace, root), args: [] }],
    ]),
  ),
};

export function jestSuite(config) {
  return {
    runner: 'jest',
    cwd: workspace,
    args: ['--config', config, '--runInBand', '--passWithNoTests', '--testPathIgnorePatterns=\\.e2e\\.spec\\.ts$'],
  };
}

export function suites(root) {
  const result = (vitestSuites[root] ?? []).map((suite) => ({ runner: 'vitest', ...suite }));
  const config = ['jest.config.ts', 'jest.config.js'].find((file) => existsSync(path.join(root, file)));
  if (root !== '.' && config) result.unshift(jestSuite(path.join(root, config)));
  if (root === 'apps/plugins/wago') {
    result.push(
      ...['audit-hooks', 'commissioning'].map((name) => jestSuite(`${root}/scripts/jest.${name}.config.cjs`)),
    );
  }
  return result;
}
