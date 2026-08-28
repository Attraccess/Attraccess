import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageDir = process.argv[2];
const distDir = process.argv[3];
if (!packageDir || !distDir) throw new Error('usage: publish-plugin.mjs <package-dir> <dist-dir>');

const packageJsonPath = join(packageDir, 'package.json');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const tag = process.env.NPM_DIST_TAG ?? (pkg.version.includes('-') ? 'next' : 'latest');

if (process.env.NPM_NIGHTLY === 'true') {
  const runNumber = process.env.GITHUB_RUN_NUMBER;
  if (!runNumber) throw new Error('GITHUB_RUN_NUMBER is required to publish a nightly plugin package.');

  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';
  pkg.version = `${pkg.version.replace(/-.+$/, '')}-nightly.${runNumber}.${runAttempt}`;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  rmSync(distDir, { recursive: true, force: true });
  execFileSync('npm', ['pack', '--pack-destination', '../dist'], { cwd: packageDir, stdio: 'inherit' });
}

const archives = readdirSync(distDir).filter((file) => file.endsWith('.tgz'));
if (archives.length !== 1) {
  throw new Error(`Expected exactly one npm tarball in ${distDir}, found ${archives.length}`);
}
const [archive] = archives;

try {
  execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], { stdio: 'ignore' });
  throw new Error(
    `${pkg.name}@${pkg.version} already exists on npm. Bump its version before publishing changed plugin code.`,
  );
} catch (error) {
  if (error instanceof Error && error.message.includes('already exists')) throw error;
}

execFileSync('npm', ['publish', resolve(distDir, archive), '--access', 'public', '--provenance', '--tag', tag], {
  stdio: 'inherit',
});
