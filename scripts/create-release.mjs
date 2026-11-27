/* eslint-disable no-console -- Release run diagnostics are intentional. */
// Create Release: version, changelog, commit and tag with nx, push to the branch, then create the GitHub release.
// `nx release` does all of this in one step, so a PR merged while the release runs rejects its push. This script
// re-creates the release commit on the moved branch with the same version and pushes again (ATT-1266).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PUSH_ATTEMPTS = 5;

export class ReleaseError extends Error {}

// Git's wording for a push refused because the branch is not what we built on (locally, or a lost race on the
// server). Other refusals, such as a ruleset or hook, are not retried.
const BRANCH_MOVED =
  /\[rejected\].*\((fetch first|non-fast-forward|stale info)\)|\[remote rejected\].*\((atomic transaction failed|cannot lock ref|failed to update ref|incorrect old value)/;
const REJECTED = /\[(remote )?rejected\]/;
const PUBLISH_ONLY_HINT = 'then run Create Release with publish-only and specifier';

export function createGit({ cwd, env } = {}) {
  const run = (...args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { ok: result.status === 0, stdout: result.stdout.trim(), output: `${result.stdout}${result.stderr}`.trim() };
  };
  const out = (...args) => {
    const result = run(...args);
    if (!result.ok) throw new ReleaseError(`git ${args.join(' ')} failed:\n${result.output}`);
    return result.stdout;
  };
  return { run, out };
}

function readVersion(git, ref) {
  return JSON.parse(git.out('show', `${ref}:package.json`)).version;
}

export function isPrerelease(version) {
  return /^\d+\.\d+\.\d+-/.test(version);
}

export function releaseCommitMessage(template, version) {
  return template.replaceAll('{version}', version).trim();
}

/** Commits what `prepare` staged and tags it like nx release (annotated tag, message = tag name). */
function commitAndTag(git, { message, tag }) {
  // The release commit carries only versions and CHANGELOG.md; the hooks would re-run every check of the workspace.
  git.out('commit', '--no-verify', '--message', message);
  git.out('tag', '--annotate', tag, '--message', tag);
  return git.out('rev-parse', 'HEAD');
}

function fetchBranch(git, { remote, branch }) {
  git.out('fetch', '--no-tags', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`);
  return git.out('rev-parse', `refs/remotes/${remote}/${branch}`);
}

/** Refuses to re-create the release on a branch that cannot take it any more. */
function assertCanRecreate(git, { remote, remoteRef, tag, startVersion }) {
  if (git.out('status', '--porcelain', '--untracked-files=no')) {
    throw new ReleaseError(`The working tree has uncommitted changes; not re-creating ${tag}. Nothing was pushed.`);
  }
  const remoteVersion = readVersion(git, remoteRef);
  if (remoteVersion !== startVersion) {
    throw new ReleaseError(
      `Another release landed on ${remoteRef} (version ${remoteVersion}, this run started from ${startVersion}); ` +
        `not re-creating ${tag}. Nothing was pushed.`,
    );
  }
  if (git.out('ls-remote', '--tags', remote, `refs/tags/${tag}`)) {
    throw new ReleaseError(`Tag ${tag} already exists on ${remote}; not re-creating it. Nothing was pushed.`);
  }
}

/** Builds the release commit and tag on HEAD; `prepare` must stage the version and changelog changes. */
async function createReleaseCommit({ git, prepare, specifier, messageTemplate }) {
  const { version, changelog } = await prepare({ specifier, dryRun: false });
  const tag = `v${version}`;
  // Changes nx did not stage would be left out of the release commit.
  if (!git.run('diff', '--quiet').ok) {
    throw new ReleaseError(`Preparing ${tag} left unstaged changes; not committing. Nothing was pushed.`);
  }
  // A version released before (or one lower than the latest) would otherwise fail at `git tag` after committing.
  if (git.run('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`).ok) {
    throw new ReleaseError(`Tag ${tag} already exists; not creating it again. Nothing was pushed.`);
  }
  const sha = commitAndTag(git, { message: releaseCommitMessage(messageTemplate, version), tag });
  return { version, tag, changelog, sha };
}

async function recreateOn(git, { prepare, messageTemplate, release, remoteRef }) {
  git.out('tag', '--delete', release.tag);
  git.out('reset', '--hard', remoteRef);
  // The exact version, not the specifier: "minor" or "prerelease" must not resolve differently on the new base.
  const next = await createReleaseCommit({ git, prepare, specifier: release.version, messageTemplate });
  if (next.version !== release.version) {
    throw new ReleaseError(
      `Re-creating the release resolved ${next.version} instead of ${release.version}. Nothing was pushed.`,
    );
  }
  return next;
}

function pushRelease(git, { remote, branch, tag }) {
  return git.run('push', '--atomic', '--no-verify', remote, `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`);
}

/** The error for a push that is not retried; an atomic rejection pushed nothing, other failures may have landed. */
function pushFailure(tag, push) {
  if (REJECTED.test(push.output)) {
    return new ReleaseError(`Pushing ${tag} was rejected; not retrying. Nothing was pushed.\n${push.output}`);
  }
  return new ReleaseError(
    `Pushing ${tag} failed; not retrying. If ${tag} reached origin anyway, create its GitHub release, ` +
      `${PUBLISH_ONLY_HINT} ${tag.slice(1)}.\n${push.output}`,
  );
}

/** Pushes the release commit and tag; re-creates them on the branch and retries while the branch keeps moving. */
async function pushWithRetry(options) {
  const { git, remote, branch, maxAttempts, log } = options;
  let release = options.release;
  for (let attempt = 1; ; attempt += 1) {
    const base = git.out('rev-parse', 'HEAD^');
    log(
      `Pushing ${release.tag} (${release.sha.slice(0, 7)} on ${base.slice(0, 7)}) to ${remote} ${branch} (attempt ${attempt}/${maxAttempts})`,
    );
    const push = pushRelease(git, { remote, branch, tag: release.tag });
    if (push.ok) return { ...release, attempts: attempt };
    if (!BRANCH_MOVED.test(push.output)) throw pushFailure(release.tag, push);
    const moved = fetchBranch(git, { remote, branch });
    if (moved === base) {
      throw new ReleaseError(
        `Pushing ${release.tag} was rejected although ${branch} did not move; not retrying. Nothing was pushed.\n${push.output}`,
      );
    }
    const remoteRef = `refs/remotes/${remote}/${branch}`;
    assertCanRecreate(git, { remote, remoteRef, tag: release.tag, startVersion: options.startVersion });
    if (attempt === maxAttempts) {
      throw new ReleaseError(
        `${branch} kept moving: ${maxAttempts} push attempts were rejected. Nothing was pushed; re-run Create Release.\n${push.output}`,
      );
    }
    log(
      `${branch} moved, re-creating release commit on ${moved.slice(0, 7)} (attempt ${attempt + 1}/${maxAttempts}); ${base.slice(0, 7)} -> ${moved.slice(0, 7)} picked up:`,
    );
    log(git.out('log', '--oneline', `${base}..${moved}`));
    release = await recreateOn(git, { ...options, release, remoteRef });
  }
}

/** Creates the GitHub release for a pushed tag with the fields nx release used. */
export function githubReleaseClient({
  token,
  repository,
  apiUrl = 'https://api.github.com',
  fetch = globalThis.fetch,
}) {
  return async ({ version, tag, body, sha }) => {
    const response = await fetch(`${apiUrl}/repos/${repository}/releases`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        body,
        prerelease: isPrerelease(version),
        make_latest: 'legacy',
        target_commitish: sha,
      }),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}: ${await response.text()}`);
    return (await response.json()).html_url;
  };
}

async function publishGithubRelease(createGithubRelease, release, log) {
  try {
    const url = await createGithubRelease({
      version: release.version,
      tag: release.tag,
      body: release.changelog,
      sha: release.sha,
    });
    log(`Created GitHub release ${release.tag}: ${url}`);
  } catch (error) {
    throw new ReleaseError(
      `${release.tag} is pushed (${release.sha}), but creating its GitHub release failed: ${error.message}\n` +
        `Create the GitHub release for ${release.tag} so release.yml runs, ${PUBLISH_ONLY_HINT} ${release.version}.`,
    );
  }
}

function currentBranch(git) {
  const branch = git.run('symbolic-ref', '--short', 'HEAD');
  if (!branch.ok) throw new ReleaseError('HEAD is detached; Create Release must run on a branch.');
  return branch.stdout;
}

function describeDryRun({ prepared, messageTemplate, remote, branch, maxAttempts, log }) {
  const tag = `v${prepared.version}`;
  log(`Dry run: would commit "${releaseCommitMessage(messageTemplate, prepared.version)}" and tag ${tag}.`);
  log(
    `Dry run: would push HEAD to ${remote} ${branch} and ${tag} atomically (up to ${maxAttempts} attempts while ${branch} moves).`,
  );
  log(
    `Dry run: would create GitHub release ${tag} (prerelease: ${isPrerelease(prepared.version)}, make_latest: legacy) on the pushed commit.`,
  );
  return { ...prepared, tag, dryRun: true };
}

/** The whole release; `prepare` and `createGithubRelease` are injected so tests can run it without nx or GitHub. */
export async function runRelease(options) {
  const {
    git,
    prepare,
    createGithubRelease,
    specifier,
    dryRun = false,
    remote = 'origin',
    log = console.log,
  } = options;
  const { messageTemplate, maxAttempts = DEFAULT_PUSH_ATTEMPTS } = options;
  const branch = currentBranch(git);
  if (dryRun) {
    const prepared = await prepare({ specifier, dryRun: true });
    return describeDryRun({ prepared, messageTemplate, remote, branch, maxAttempts, log });
  }
  const startVersion = readVersion(git, 'HEAD');
  const release = await createReleaseCommit({ git, prepare, specifier, messageTemplate });
  const pushed = await pushWithRetry({
    git,
    prepare,
    messageTemplate,
    remote,
    branch,
    maxAttempts,
    log,
    release,
    startVersion,
  });
  await publishGithubRelease(createGithubRelease, pushed, log);
  return pushed;
}

const SELF = fileURLToPath(import.meta.url);

/** Runs nx's version and changelog steps in a child process, so an nx `process.exit` surfaces as a clear failure. */
function nxPrepare({ specifier, dryRun }) {
  const dir = mkdtempSync(join(tmpdir(), 'create-release-'));
  const out = join(dir, 'prepared.json');
  try {
    const env = {
      ...process.env,
      RELEASE_PREPARE_SPECIFIER: specifier,
      RELEASE_PREPARE_OUT: out,
      RELEASE_PREPARE_DRY_RUN: String(dryRun),
    };
    const child = spawnSync(process.execPath, [SELF, '--prepare'], { env, stdio: 'inherit' });
    if (child.status !== 0) {
      throw new ReleaseError(
        `nx could not version ${specifier} (exit ${child.status ?? child.signal}). Nothing was pushed.`,
      );
    }
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The steps `nx release` runs before committing (nx/src/command-line/release/release.js), without commit, tag, push
// or GitHub release.
async function runNxPrepare(env) {
  const { releaseVersion, releaseChangelog } = createRequire(import.meta.url)('nx/release');
  const dryRun = env.RELEASE_PREPARE_DRY_RUN === 'true';
  const git = { gitCommit: false, gitTag: false, stageChanges: true, deleteVersionPlans: false };
  const versioned = await releaseVersion({ specifier: env.RELEASE_PREPARE_SPECIFIER, dryRun, ...git });
  if (!versioned.workspaceVersion) throw new Error('nx resolved no new workspace version.');
  process.env.NX_RELEASE_INTERNAL_SUPPRESS_FILTER_LOG = 'true';
  const changelog = await releaseChangelog({
    version: versioned.workspaceVersion,
    versionData: versioned.projectsVersionData,
    releaseGraph: versioned.releaseGraph,
    dryRun,
    ...git,
    gitPush: false,
    createRelease: false,
  });
  const prepared = { version: versioned.workspaceVersion, changelog: changelog.workspaceChangelog?.contents ?? '' };
  writeFileSync(env.RELEASE_PREPARE_OUT, JSON.stringify(prepared));
}

/** The rebuild step checks out nothing; it refuses to run unless HEAD is this `sha`. A dry run has none. */
export function setOutputs(release, file = process.env.GITHUB_OUTPUT) {
  if (!file) return;
  appendFileSync(file, `version=${release.version}\nsha=${release.sha ?? ''}\n`);
}

/** The workflow's inputs, read from the step environment. */
export function optionsFromEnv(env) {
  if (!env.SPECIFIER) throw new ReleaseError('SPECIFIER is required.');
  const dryRun = env.DRY_RUN === 'true';
  if (!dryRun && !(env.GITHUB_TOKEN && env.GITHUB_REPOSITORY)) {
    throw new ReleaseError('GITHUB_TOKEN and GITHUB_REPOSITORY are required to create the GitHub release.');
  }
  const maxAttempts = Number(env.RELEASE_PUSH_ATTEMPTS || DEFAULT_PUSH_ATTEMPTS);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new ReleaseError(`RELEASE_PUSH_ATTEMPTS must be a positive integer, got "${env.RELEASE_PUSH_ATTEMPTS}".`);
  }
  const client = { token: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY, apiUrl: env.GITHUB_API_URL };
  return { specifier: env.SPECIFIER, dryRun, maxAttempts, createGithubRelease: githubReleaseClient(client) };
}

async function main() {
  const options = optionsFromEnv(process.env);
  const messageTemplate = JSON.parse(readFileSync('nx.json', 'utf8')).release.git.commitMessage;
  const release = await runRelease({ ...options, git: createGit(), prepare: nxPrepare, messageTemplate });
  if (!release.dryRun)
    console.log(`Released ${release.tag} at ${release.sha} after ${release.attempts} push attempt(s).`);
  setOutputs(release);
}

function fail(error) {
  console.error(error instanceof ReleaseError ? error.message : error);
  process.exit(1);
}

if (import.meta.main) {
  (process.argv[2] === '--prepare' ? runNxPrepare(process.env) : main()).catch(fail);
}
