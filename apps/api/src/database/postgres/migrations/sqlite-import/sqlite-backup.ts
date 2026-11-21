import { mkdir, rename, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

/** SQLite keeps uncommitted or checkpoint data next to the file under these suffixes. */
const COMPANIONS = ['-wal', '-shm', '-journal'];

/** The folder next to the SQLite file that keeps it after the import: `<STORAGE_ROOT>/sqlite-backup/`. */
export function sqliteBackupDirectory(sqliteFile: string): string {
  return join(dirname(sqliteFile), 'sqlite-backup');
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Whether a backup file or one of its companions already uses this name. */
async function taken(target: string): Promise<boolean> {
  for (const file of [target, ...COMPANIONS.map((suffix) => target + suffix)]) {
    if (await fileExists(file)) return true;
  }
  return false;
}

/** The SQLite file reached the backup folder, but one of its -wal, -shm or -journal files did not. */
export class PartialBackupMoveError extends Error {
  constructor(
    /** Where the SQLite file is now. */
    readonly location: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PartialBackupMoveError';
  }
}

/** `20261121T093000123Z`: a UTC timestamp that sorts and is safe in a file name. */
function stamp(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '');
}

/**
 * Moves the SQLite file and its -wal, -shm and -journal files into the backup folder. A backup that is already there is
 * never overwritten: the new names then carry a UTC timestamp (`attraccess-<stamp>.sqlite`). Returns the new path of
 * the SQLite file. If a -wal, -shm or -journal file cannot follow the moved SQLite file, a `PartialBackupMoveError` names
 * where the SQLite file is now.
 */
export async function moveToBackup(sqliteFile: string, now: Date = new Date()): Promise<string> {
  const directory = sqliteBackupDirectory(sqliteFile);
  await mkdir(directory, { recursive: true });
  const name = basename(sqliteFile);
  let target = join(directory, name);
  if (await taken(target)) {
    const extension = extname(name);
    target = join(directory, `${name.slice(0, name.length - extension.length)}-${stamp(now)}${extension}`);
    if (await taken(target)) throw new Error(`${target} already exists`);
  }
  await rename(sqliteFile, target);
  for (const suffix of COMPANIONS) {
    try {
      if (await fileExists(sqliteFile + suffix)) await rename(sqliteFile + suffix, target + suffix);
    } catch (error) {
      throw new PartialBackupMoveError(
        target,
        `${sqliteFile} moved to ${target}, but ${sqliteFile + suffix} did not: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }
  return target;
}
