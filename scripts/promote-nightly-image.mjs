import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The ancestry helpers live with the plugin publish plan; npm channels and nightly-latest follow the same rule.
import { asCommit, isNewerPublished, localGit, refreshHistory } from '../apps/plugins/scripts/plugin-publish-plan.mjs';

/** Reads `org.opencontainers.image.revision` from `docker buildx imagetools inspect --format '{{json .Image}}'`. */
export function revisionFromImageConfig(inspectJson) {
  const image = typeof inspectJson === 'string' ? JSON.parse(inspectJson) : inspectJson;
  // A multi-platform index prints one config per platform; a single image prints the config itself.
  const config = image?.config ? image : Object.values(image ?? {}).find((entry) => entry?.config);
  return asCommit(config?.config?.Labels?.['org.opencontainers.image.revision']);
}

/**
 * `nightly-latest` only moves forward: keep it when it already carries a descendant of `head`.
 * A missing label (legacy image) or an unknown commit counts as older.
 */
export function shouldMoveNightlyLatest({ head, currentRevision, git, historyFetched = true }) {
  return !isNewerPublished({ head, commit: currentRevision, git, historyFetched });
}

/** The `imagetools create` calls that point nightly-latest at this run's image, by digest when known. */
export function promotionCommands({ images, head, digest }) {
  const source = (image) => (digest ? `${image}@${digest}` : `${image}:nightly-${head.slice(0, 7)}`);
  return images.map((image) => ['create', '--tag', `${image}:nightly-latest`, source(image)]);
}

const imagetools = (...args) =>
  execFileSync('docker', ['buildx', 'imagetools', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Only a missing tag means "no nightly-latest yet"; an auth or network failure must not look like one. */
export function isMissingTagError(error) {
  return /not found|manifest unknown|404/i.test(`${error?.stderr ?? ''}${error?.message ?? ''}`);
}

function currentRevision(ref) {
  try {
    return revisionFromImageConfig(imagetools('inspect', ref, '--format', '{{json .Image}}'));
  } catch (error) {
    if (isMissingTagError(error)) return null;
    throw error;
  }
}

function report(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

export function imageRefs(env) {
  return [env.GHCR_IMAGE_NAME && `ghcr.io/${env.GHCR_IMAGE_NAME}`, env.DOCKERHUB_IMAGE_NAME].filter(Boolean);
}

function promote({ images, head, revision }) {
  for (const args of promotionCommands({ images, head, digest: process.env.IMAGE_DIGEST })) {
    imagetools(...args);
    report(`Moved ${args[2]} to ${args[3]} (previous revision: ${revision?.slice(0, 7) ?? 'none'}).`);
  }
}

function main() {
  const head = process.env.GITHUB_SHA;
  const images = imageRefs(process.env);
  if (!head || images.length === 0)
    throw new Error('GITHUB_SHA and GHCR_IMAGE_NAME/DOCKERHUB_IMAGE_NAME are required.');

  const historyFetched = refreshHistory();
  const revision = currentRevision(`${images[0]}:nightly-latest`);
  if (shouldMoveNightlyLatest({ head, currentRevision: revision, git: localGit, historyFetched })) {
    promote({ images, head, revision });
    return;
  }
  report(
    `Kept nightly-latest: it already carries newer commit ${revision.slice(0, 7)} (this run is ${head.slice(0, 7)}).`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
