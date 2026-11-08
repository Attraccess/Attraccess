import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { isNewerPublished, localGit, readChannelState, refreshHistory } from './plugin-publish-plan.mjs';

const packageDir = process.argv[2];
const distDir = process.argv[3];
if (!packageDir || !distDir) throw new Error('usage: publish-plugin.mjs <package-dir> <dist-dir>');

const packageJsonPath = join(packageDir, 'package.json');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const nightly = process.env.NPM_NIGHTLY === 'true';
// Nightlies own `next`, releases own `latest`; no CI path publishes any other tag.
const tag = process.env.NPM_DIST_TAG ?? (nightly ? 'next' : 'latest');
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// An older run finishing late must not move the channel backwards.
refreshHistory();
const published = readChannelState(pkg.name, tag);
if (isNewerPublished({ head: commit, commit: published?.commit, git: localGit })) {
  console.log(
    `Skipping ${pkg.name}: ${tag} already points at ${published.version} built from newer commit ${published.commit}.`,
  );
  process.exit(0);
}

const baseVersion = pkg.version.replace(/-.+$/, '');
if (nightly) {
  const runNumber = process.env.GITHUB_RUN_NUMBER;
  if (!runNumber) throw new Error('GITHUB_RUN_NUMBER is required to publish a nightly plugin package.');
  pkg.version = `${baseVersion}-nightly.${runNumber}.${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`;
} else {
  pkg.version = baseVersion;
}

try {
  execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], { stdio: 'ignore' });
  throw new Error(
    `${pkg.name}@${pkg.version} already exists on npm. Bump its version before publishing changed plugin code.`,
  );
} catch (error) {
  if (error instanceof Error && error.message.includes('already exists')) throw error;
}

// The commit is the durable "last published" record the publish plan reads back. npm keeps `gitHead` from
// the tarball manifest; `attraccess.publishedCommit` is the fallback if a registry ever strips it.
pkg.gitHead = commit;
pkg.attraccess = { ...pkg.attraccess, publishedCommit: commit };
writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
execFileSync('npm', ['pack', '--pack-destination', '../dist'], { cwd: packageDir, stdio: 'inherit' });

const archives = readdirSync(distDir).filter((file) => file.endsWith('.tgz'));
if (archives.length !== 1) {
  throw new Error(`Expected exactly one npm tarball in ${distDir}, found ${archives.length}`);
}
const [archive] = archives;

execFileSync('npm', ['publish', resolve(distDir, archive), '--access', 'public', '--provenance', '--tag', tag], {
  stdio: 'inherit',
});
