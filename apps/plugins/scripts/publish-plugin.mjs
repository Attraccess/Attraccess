import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageDir = process.argv[2];
const distDir = process.argv[3];
if (!packageDir || !distDir) throw new Error('usage: publish-plugin.mjs <package-dir> <dist-dir>');

const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const archive = readdirSync(distDir).find((file) => file.endsWith('.tgz'));
if (!archive) throw new Error(`No npm tarball found in ${distDir}`);

try {
  execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], { stdio: 'ignore' });
  throw new Error(
    `${pkg.name}@${pkg.version} already exists on npm. Bump its version before publishing changed plugin code.`,
  );
} catch (error) {
  if (error instanceof Error && error.message.includes('already exists')) throw error;
}

const tag = pkg.version.includes('-') ? 'next' : 'latest';
execFileSync('npm', ['publish', resolve(distDir, archive), '--access', 'public', '--provenance', '--tag', tag], {
  stdio: 'inherit',
});
