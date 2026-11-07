/* eslint-disable no-console -- CLI usage errors are intentional. */
// Runs node:test files with Istanbul coverage for the project's crap-score target.
// Usage: node scripts/crap-score/node-test.mjs <project root> <coverage directory> <test files...>
// Node's own coverage has no Istanbul function ranges, so a module hook instruments
// the project's JavaScript sources in the test processes and their children.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import istanbulCoverage from 'istanbul-lib-coverage';
import { isSource, ownedFiles, workspace } from './sources.mjs';

const loader = fileURLToPath(new URL('./node-coverage.mjs', import.meta.url));

// Returns the test exit status and writes <output>/coverage-final.json.
export function nodeCoverage(files, tests, output) {
  rmSync(output, { recursive: true, force: true });
  const raw = path.join(output, 'processes');
  mkdirSync(raw, { recursive: true });
  const manifest = path.join(output, 'manifest.json');
  const sourceCopies = {};
  for (const file of files) {
    const absolute = path.resolve(workspace, file);
    const hash = createHash('sha256').update(readFileSync(absolute)).digest('hex');
    (sourceCopies[hash] ??= []).push(absolute);
  }
  writeFileSync(
    manifest,
    JSON.stringify({ files: files.map((file) => path.resolve(workspace, file)), sourceCopies, output: raw }),
  );
  // Nested runs (tests that start this runner) must not stack a second hook.
  const inherited = (process.env.NODE_OPTIONS ?? '').replaceAll(`--import=${loader}`, '').trim();
  const env = { ...process.env, CRAP_NODE_MANIFEST: manifest, NODE_OPTIONS: `${inherited} --import=${loader}` };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: workspace, stdio: 'inherit', env });
  const coverage = istanbulCoverage.createCoverageMap({});
  for (const file of readdirSync(raw)) coverage.merge(JSON.parse(readFileSync(path.join(raw, file), 'utf8')));
  rmSync(raw, { recursive: true, force: true });
  rmSync(manifest, { force: true });
  writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify(coverage.toJSON()));
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output, ...tests] = process.argv.slice(2);
  if (!root || !output || !tests.length) {
    console.error('Usage: node scripts/crap-score/node-test.mjs <project root> <coverage directory> <test files...>');
    process.exit(1);
  }
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: workspace,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file && existsSync(path.resolve(workspace, file)));
  const files = ownedFiles(root, tracked).filter((file) => isSource(file) && /\.[cm]?js$/.test(file));
  process.exitCode = nodeCoverage(files, tests, path.resolve(workspace, output));
}
