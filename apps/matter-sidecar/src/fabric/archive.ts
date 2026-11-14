import { MAX_BACKUP_BODY_BYTES } from '@attraccess/matter-contract';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/** A directory tree as one blob: gzip(JSON of relative path -> base64 content). Built only from a closed storage. */
type ArchiveBody = { version: 1; files: { path: string; data: string }[] };

const MAX_FILES = 100_000;
/**
 * Largest unpacked archive. The packed archive travels base64-encoded in a request of at most `MAX_BACKUP_BODY_BYTES`;
 * twice that leaves room for the gzip ratio of the matter.js storage while bounding what a crafted archive can inflate
 * to. Snapshots above it are refused when they are made, so every snapshot the sidecar hands out can be restored.
 */
export const MAX_UNPACKED_BYTES = 2 * MAX_BACKUP_BODY_BYTES;

export class ArchiveError extends Error {}

function walk(root: string, directory: string, out: string[], include?: readonly string[]) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (include && directory === root && !include.includes(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(root, full, out);
    else if (entry.isFile())
      out.push(
        full
          .slice(root.length + 1)
          .split(sep)
          .join('/'),
      );
    // Symbolic links and special files are never part of a snapshot.
  }
}

/** `include` limits the archive to these top-level entries of `root`. */
export function packDirectory(root: string, include?: readonly string[]): Buffer {
  const paths: string[] = [];
  if (existsSync(root)) walk(root, root, paths, include);
  paths.sort();
  const body: ArchiveBody = {
    version: 1,
    files: paths.map((path) => ({ path, data: readFileSync(join(root, path)).toString('base64') })),
  };
  const json = Buffer.from(JSON.stringify(body));
  if (json.length > MAX_UNPACKED_BYTES) throw new ArchiveError('The Matter storage is too large for a snapshot.');
  return gzipSync(json);
}

/** True for a relative POSIX path that stays inside the extraction root. */
function isSafePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** Extracts into `target`, which must not exist yet. Directories get 0700 and files 0600. Throws ArchiveError. */
export function unpackInto(archive: Buffer, target: string, maxBytes = MAX_UNPACKED_BYTES): void {
  let body: ArchiveBody;
  try {
    body = JSON.parse(gunzipSync(archive, { maxOutputLength: maxBytes }).toString('utf8')) as ArchiveBody;
  } catch {
    throw new ArchiveError('The snapshot is not a valid archive.');
  }
  if (body?.version !== 1 || !Array.isArray(body.files) || body.files.length > MAX_FILES) {
    throw new ArchiveError('The snapshot is not a valid archive.');
  }
  const base = resolve(target);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const seen = new Set<string>();
  for (const file of body.files) {
    if (
      typeof file?.path !== 'string' ||
      typeof file.data !== 'string' ||
      !isSafePath(file.path) ||
      seen.has(file.path)
    ) {
      throw new ArchiveError('The snapshot contains an invalid entry.');
    }
    seen.add(file.path);
    const destination = resolve(base, file.path);
    if (!destination.startsWith(base + sep)) throw new ArchiveError('The snapshot contains an invalid entry.');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, Buffer.from(file.data, 'base64'), { mode: 0o600 });
    chmodSync(destination, 0o600);
  }
}

export const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

export function directoryHasFiles(directory: string): boolean {
  try {
    const paths: string[] = [];
    walk(directory, directory, paths);
    return paths.length > 0;
  } catch {
    return false;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
