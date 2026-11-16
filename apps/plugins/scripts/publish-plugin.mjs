import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  assertChannel,
  channelVersion,
  isNewerPublished,
  localGit,
  npmView,
  readChannelState,
  refreshHistory,
  versionExistsMessage,
} from './plugin-publish-plan.mjs';

const packageDir = process.argv[2];
const distDir = process.argv[3];
if (!packageDir || !distDir) throw new Error('usage: publish-plugin.mjs <package-dir> <dist-dir>');

// plugin-publish-plan.mjs sets the channel and commit; nightlies own `next`, releases own `latest`.
const tag = process.env.NPM_DIST_TAG;
if (!tag) throw new Error('NPM_DIST_TAG is required; publish through apps/plugins/scripts/plugin-publish-plan.mjs.');
try {
  assertChannel(tag);
} catch {
  throw new Error(`NPM_DIST_TAG must be one of next, latest, got "${tag}".`);
}

const packageJsonPath = join(packageDir, 'package.json');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// An older run finishing late must not move the channel backwards.
const historyFetched = refreshHistory();
const published = readChannelState(pkg.name, tag);
if (isNewerPublished({ head: commit, commit: published?.commit, git: localGit, historyFetched })) {
  console.log(
    `Skipping ${pkg.name}: ${tag} already points at ${published.version} built from newer commit ` +
      `${published.commit.slice(0, 7)} (this run is ${commit.slice(0, 7)}).`,
  );
  process.exit(0);
}

pkg.version = channelVersion(pkg.version, tag, {
  runNumber: process.env.GITHUB_RUN_NUMBER,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
});
if (npmView(`${pkg.name}@${pkg.version}`, 'version')) throw new Error(versionExistsMessage(pkg.name, pkg.version));

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
