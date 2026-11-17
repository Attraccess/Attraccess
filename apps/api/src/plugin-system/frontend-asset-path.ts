import { closeSync, constants, fstatSync, openSync, realpathSync } from 'fs';
import { resolve, sep } from 'path';

export type FrontendAssetRejection =
  | 'empty path'
  | 'empty segment'
  | 'dot segment'
  | 'separator in segment'
  | 'nul byte'
  | 'drive letter'
  | 'frontend directory outside plugin directory'
  | 'frontend directory missing'
  | 'file missing'
  | 'resolved outside frontend directory'
  | 'not a regular file';

export type FrontendAssetResolution = { fd: number } | { reason: FrontendAssetRejection };

const DRIVE_LETTER = /^[a-zA-Z]:/;
// C0/C1 controls, line/paragraph separators and bidi overrides could forge or disguise log lines
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const LOG_PREFIX_LENGTH = 32;
// a file swapped for a symlink or FIFO after the checks fails to open instead of being followed or blocking
// (only the last component: swapping a folder needs write access to the plugin, which already runs code)
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/**
 * Express 5 (path-to-regexp v8) hands a `*name` wildcard over as an array of
 * percent-decoded segments, so `%2f` arrives as a `/` inside one segment.
 * A plain string (older adapters) is split on `/`.
 */
export function frontendAssetSegments(filePath: string | string[] | undefined): string[] {
  if (Array.isArray(filePath)) return filePath;
  return filePath ? filePath.split('/') : [];
}

/** A missing file is an ordinary 404 (stale chunk, source map); every other rejection is worth a warning. */
export function isMissingFrontendAsset(reason: FrontendAssetRejection): boolean {
  return reason === 'file missing';
}

function segmentRejection(segment: string): FrontendAssetRejection | null {
  if (segment === '') return 'empty segment';
  if (segment === '.' || segment === '..') return 'dot segment';
  if (segment.includes('\0')) return 'nul byte';
  // a leading `/` or `\` (absolute or UNC path) is caught here as well
  if (segment.includes('/') || segment.includes('\\')) return 'separator in segment';
  if (DRIVE_LETTER.test(segment)) return 'drive letter';
  return null;
}

function isInside(parent: string, child: string): boolean {
  return child === parent || isStrictlyInside(parent, child);
}

function isStrictlyInside(parent: string, child: string): boolean {
  return child !== parent && child.startsWith(parent + sep);
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * Opens a requested plugin frontend file and refuses anything that could
 * leave the plugin's frontend directory: traversal segments, encoded
 * separators, drive letters, symlinks pointing elsewhere, and a manifest
 * whose frontend directory points outside the plugin's own directory.
 * Paths are compared after realpath, since PLUGIN_PATH may itself sit behind
 * a symlink (/var -> /private/var, volumes). The caller owns the returned fd.
 */
export function openFrontendAsset(
  pluginPath: string,
  pluginDirectory: string,
  frontendDirectory: string,
  segments: string[],
): FrontendAssetResolution {
  if (segments.length === 0) return { reason: 'empty path' };
  for (const segment of segments) {
    const reason = segmentRejection(segment);
    if (reason) return { reason };
  }

  const pluginsRoot = realpathOrNull(pluginPath);
  const pluginDir = realpathOrNull(resolve(pluginPath, pluginDirectory));
  const frontendDir = realpathOrNull(resolve(pluginPath, frontendDirectory));
  if (!pluginsRoot || !pluginDir || !frontendDir) return { reason: 'frontend directory missing' };
  if (!isStrictlyInside(pluginsRoot, pluginDir) || !isInside(pluginDir, frontendDir)) {
    return { reason: 'frontend directory outside plugin directory' };
  }

  const real = realpathOrNull(resolve(frontendDir, ...segments));
  if (!real) return { reason: 'file missing' };
  if (!isStrictlyInside(frontendDir, real)) return { reason: 'resolved outside frontend directory' };

  let fd: number;
  try {
    fd = openSync(real, OPEN_FLAGS);
  } catch {
    return { reason: 'file missing' };
  }
  if (!fstatSync(fd).isFile()) {
    closeSync(fd);
    return { reason: 'not a regular file' };
  }
  return { fd };
}

/** A short, log-safe excerpt of untrusted path input. */
export function sanitizedPathPrefix(segments: string[]): string {
  return JSON.stringify(segments.join('/').replace(CONTROL_CHARACTERS, '').slice(0, LOG_PREFIX_LENGTH));
}
