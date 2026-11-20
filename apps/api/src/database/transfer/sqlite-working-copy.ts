import { copyFile, link, mkdtemp, open, rename, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteTransferError } from './transfer-errors';

const SQLITE_HEADER = 'SQLite format 3\0';
/**
 * The files SQLite keeps next to a database: the rollback journal (1.x never enabled WAL, so a killed container leaves
 * a hot `-journal` that must be rolled back on the copy) and the WAL files.
 */
const SIDE_FILES = ['-journal', '-wal', '-shm'] as const;

export interface WorkingCopy {
  readonly file: string;
  remove(): Promise<void>;
}

/** Error codes that mean "there is no such file"; ENOTDIR: a path component is a file, so nothing can be below it. */
const ABSENT = new Set(['ENOENT', 'ENOTDIR']);

/**
 * Whether a file exists. Only "no such file" counts as absent: a storage mount that cannot be read (EACCES, EIO) must
 * stop the caller, never look like an installation without SQLite data or a database without a hot journal.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code && ABSENT.has(code)) return false;
    throw new Error(
      `cannot tell whether ${path} exists (${code ?? safeErrorName(error)}); make the storage directory readable by ` +
        'the API',
      { cause: error },
    );
  }
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
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
 * Copies the SQLite file, with its -journal, -wal and -shm files when present, to a private temporary directory. The original is
 * only read; every later step works on the copy.
 */
export async function copyToWorkingDirectory(original: string): Promise<WorkingCopy> {
  await assertSqliteFile(original);
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-sqlite-transfer-'));
  const file = join(directory, 'attraccess.sqlite');
  try {
    await copyFile(original, file);
    for (const suffix of SIDE_FILES) {
      if (await fileExists(original + suffix)) await copyFile(original + suffix, file + suffix);
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { file, remove: () => rm(directory, { recursive: true, force: true }) };
}

/** Gives every file its new name as a hard link (atomic, never overwrites), or undefined when links are unsupported. */
async function linkAll(pairs: ReadonlyArray<readonly [string, string]>): Promise<boolean> {
  const linked: string[] = [];
  try {
    for (const [from, to] of pairs) {
      await link(from, to);
      linked.push(to);
    }
    return true;
  } catch (error) {
    await Promise.all(linked.map((name) => unlink(name).catch(() => undefined)));
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') throw error;
    return false;
  }
}

/**
 * `attraccess.sqlite` -> `attraccess.sqlite.migrated-to-postgres-<timestamp>`, with its -journal, -wal and -shm files.
 * Every new name is first created as a hard link, so the renamed set is complete before any old name goes away; then
 * the database file loses its old name first and the side files after it. A crash in between never leaves the old
 * database name without its (possibly hot) journal. Where the file system has no hard links, the files are renamed
 * side files first and the database file last. Nothing is overwritten: when a target name exists, nothing is renamed.
 */
export async function markMigrated(original: string, now: Date = new Date()): Promise<string> {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const target = `${original}.migrated-to-postgres-${stamp}`;
  const sides: string[] = [];
  for (const suffix of SIDE_FILES) if (await fileExists(original + suffix)) sides.push(suffix);
  for (const name of [target, ...sides.map((suffix) => target + suffix)]) {
    if (await fileExists(name)) throw new Error(`${name} already exists; the SQLite file was not renamed`);
  }
  const pairs = [[original, target] as const, ...sides.map((suffix) => [original + suffix, target + suffix] as const)];
  if (await linkAll(pairs)) {
    for (const [from] of pairs) await unlink(from);
    return target;
  }
  for (const suffix of sides) await rename(original + suffix, target + suffix);
  await rename(original, target);
  return target;
}
