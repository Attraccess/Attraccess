import { createWriteStream } from 'fs';

import { mkdir } from 'fs/promises';

import { dirname, isAbsolute, relative, resolve } from 'path';

import { pipeline } from 'stream/promises';

import { fromBufferPromise, type Entry } from 'yauzl';

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
// yauzl's own name checks (strictFileNames) fail the entry iterator with these messages before we see the entry.
const YAUZL_UNSAFE_NAME = /^(?:invalid characters in fileName|absolute path|invalid relative path): ([\s\S]*)$/;
// Writing an entry over one already extracted ('wx'), or a file where a folder is (or the reverse).
const ENTRY_CONFLICT_CODES = new Set(['EEXIST', 'ENOTDIR', 'EISDIR']);

/** A ZIP entry that must not be written: it escapes the target folder or is not a plain file or folder. */
export class UnsafeZipEntryError extends Error {
  constructor(entryName: string, reason: string) {
    super(`Unsafe zip entry "${entryName}": ${reason}`);
    this.name = 'UnsafeZipEntryError';
  }
}

/**
 * Extracts a ZIP archive into `targetFolder` and returns the number of entries written.
 *
 * Rejects (before writing that entry) absolute, drive-letter, backslash and `..` paths, symlinks, hardlinks and other
 * special files, encrypted entries and paths that occur twice. yauzl validates names and sizes itself (its name errors
 * are rethrown as {@link UnsafeZipEntryError}); the checks here keep the guarantee independent of its defaults.
 */
export async function extractPluginZip(buffer: Buffer, targetFolder: string): Promise<number> {
  const root = resolve(targetFolder);
  const zipFile = await fromBufferPromise(buffer, { strictFileNames: true, validateEntrySizes: true });
  let written = 0;
  try {
    for await (const entry of zipFile.eachEntry()) {
      const target = safeTargetPath(root, entry);
      try {
        if (entry.fileName.endsWith('/')) {
          await mkdir(target, { recursive: true });
        } else {
          await mkdir(dirname(target), { recursive: true });
          const mode = entryMode(entry) & 0o755;
          await pipeline(
            await zipFile.openReadStreamPromise(entry),
            createWriteStream(target, { flags: 'wx', mode: mode || 0o644 }),
          );
        }
      } catch (error) {
        if (ENTRY_CONFLICT_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
          throw new UnsafeZipEntryError(entry.fileName, 'the archive contains this path more than once');
        }
        throw error;
      }
      written++;
    }
  } catch (error) {
    const unsafeName = error instanceof Error && !(error instanceof UnsafeZipEntryError) && YAUZL_UNSAFE_NAME.exec(error.message);
    if (unsafeName) {
      throw new UnsafeZipEntryError(unsafeName[1], 'path leaves the target folder');
    }
    throw error;
  } finally {
    zipFile.close();
  }
  return written;
}

function entryMode(entry: Entry): number {
  // Unix-created archives keep st_mode in the upper 16 bits; DOS-created ones leave it 0.
  return (entry.externalFileAttributes >>> 16) & 0xffff;
}

function safeTargetPath(root: string, entry: Entry): string {
  const name = entry.fileName;
  if (name.includes('\\') || /^[a-zA-Z]:/.test(name) || name.startsWith('/') || name.split('/').includes('..')) {
    throw new UnsafeZipEntryError(name, 'path leaves the target folder');
  }
  const type = entryMode(entry) & S_IFMT;
  if (type !== 0 && type !== S_IFREG && type !== S_IFDIR) {
    throw new UnsafeZipEntryError(name, 'only regular files and folders are allowed');
  }
  if (entry.isEncrypted()) {
    throw new UnsafeZipEntryError(name, 'encrypted entries are not supported');
  }
  const target = resolve(root, name);
  const fromRoot = relative(root, target);
  // `./` resolves to the target folder itself, which is only fine for a folder entry.
  if ((!fromRoot && !name.endsWith('/')) || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new UnsafeZipEntryError(name, 'path leaves the target folder');
  }
  return target;
}
