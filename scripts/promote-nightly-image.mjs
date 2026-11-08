import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { isNewerPublished, localGit, refreshHistory } from '../apps/plugins/scripts/plugin-publish-plan.mjs';

/** Reads `org.opencontainers.image.revision` from `docker buildx imagetools inspect --format '{{json .Image}}'`. */
export function revisionFromImageConfig(inspectJson) {
  const image = typeof inspectJson === 'string' ? JSON.parse(inspectJson) : inspectJson;
  // A multi-platform index prints one config per platform; a single image prints the config itself.
  const config = image?.config ? image : Object.values(image ?? {}).find((entry) => entry?.config);
  return config?.config?.Labels?.['org.opencontainers.image.revision'] ?? null;
}

/**
 * `nightly-latest` only moves forward: keep it when it already carries a descendant of `head`.
 * A missing label (legacy image) or an unknown commit counts as older.
 */
export function shouldMoveNightlyLatest({ head, currentRevision, git }) {
  return !isNewerPublished({ head, commit: currentRevision, git });
}

const imagetools = (...args) => execFileSync('docker', ['buildx', 'imagetools', ...args], { encoding: 'utf8' });

function currentRevision(ref) {
  try {
    return revisionFromImageConfig(imagetools('inspect', ref, '--format', '{{json .Image}}'));
  } catch {
    return null; // no nightly-latest yet
  }
}

function main() {
  const head = process.env.GITHUB_SHA;
  const images = [
    process.env.GHCR_IMAGE_NAME && `ghcr.io/${process.env.GHCR_IMAGE_NAME}`,
    process.env.DOCKERHUB_IMAGE_NAME,
  ].filter(Boolean);
  if (!head || images.length === 0)
    throw new Error('GITHUB_SHA and GHCR_IMAGE_NAME/DOCKERHUB_IMAGE_NAME are required.');
  const sourceTag = `nightly-${head.slice(0, 7)}`;

  refreshHistory();
  const revision = currentRevision(`${images[0]}:nightly-latest`);
  if (!shouldMoveNightlyLatest({ head, currentRevision: revision, git: localGit })) {
    console.log(`Keeping nightly-latest: it already carries newer commit ${revision} (this run is ${head}).`);
    return;
  }
  for (const image of images) {
    imagetools('create', '--tag', `${image}:nightly-latest`, `${image}:${sourceTag}`);
    console.log(`Moved ${image}:nightly-latest to ${sourceTag} (previous revision: ${revision ?? 'none'}).`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
