import { copyFile, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteTransferError } from './transfer-errors';

const SQLITE_HEADER = 'SQLite format 3\0';
const SIDE_FILES = ['-wal', '-shm'] as const;

export interface WorkingCopy {
  readonly file: string;
  remove(): Promise<void>;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function assertSqliteFile(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    const { bytesRead, buffer } = await handle.read(Buffer.alloc(16), 0, 16, 0);
    if (bytesRead < 16 || buffer.toString('latin1') !== SQLITE_HEADER) {
      throw new SqliteTransferError('reading the SQLite file', `${path} is not a SQLite database`);
    }
  } finally {
    await handle.close();
  }
}

/**
 * Copies the SQLite file, with its -wal and -shm files when present, to a private temporary directory. The original is
 * only read; every later step works on the copy.
 */
export async function copyToWorkingDirectory(original: string): Promise<WorkingCopy> {
  await assertSqliteFile(original);
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-sqlite-transfer-'));
  const file = join(directory, 'attraccess.sqlite');
  try {
    await copyFile(original, file);
    for (const suffix of SIDE_FILES) {
      if (await exists(original + suffix)) await copyFile(original + suffix, file + suffix);
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { file, remove: () => rm(directory, { recursive: true, force: true }) };
}

/** `attraccess.sqlite` -> `attraccess.sqlite.migrated-to-postgres-<timestamp>` (also the -wal and -shm files). */
export async function markMigrated(original: string, now: Date = new Date()): Promise<string> {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const target = `${original}.migrated-to-postgres-${stamp}`;
  await rename(original, target);
  for (const suffix of SIDE_FILES) {
    if (await exists(original + suffix)) await rename(original + suffix, target + suffix);
  }
  return target;
}
