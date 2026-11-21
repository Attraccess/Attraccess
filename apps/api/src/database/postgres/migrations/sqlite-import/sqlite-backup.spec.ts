import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveToBackup, PartialBackupMoveError, sqliteBackupDirectory } from './sqlite-backup';

/** Set by a test to make renaming one path fail; every other call goes to the real fs. */
let failRenameOf: string | undefined;
jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual('node:fs/promises');
  return {
    ...actual,
    rename: (from: string, to: string) =>
      from === failRenameOf ? Promise.reject(new Error('EACCES: permission denied')) : actual.rename(from, to),
  };
});

describe('moveToBackup', () => {
  let root: string;
  let file: string;
  const now = new Date('2026-11-21T09:30:00.123Z');

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'attraccess-sqlite-backup-'));
    file = join(root, 'attraccess.sqlite');
    await writeFile(file, 'data');
  });

  afterEach(async () => {
    failRenameOf = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it('moves the file with its -wal, -shm and -journal files into <STORAGE_ROOT>/sqlite-backup/', async () => {
    for (const suffix of ['-wal', '-shm', '-journal']) await writeFile(file + suffix, suffix);

    const target = await moveToBackup(file, now);

    expect(sqliteBackupDirectory(file)).toBe(join(root, 'sqlite-backup'));
    expect(target).toBe(join(root, 'sqlite-backup', 'attraccess.sqlite'));
    expect(await readdir(root)).toEqual(['sqlite-backup']);
    expect((await readdir(join(root, 'sqlite-backup'))).sort()).toEqual([
      'attraccess.sqlite',
      'attraccess.sqlite-journal',
      'attraccess.sqlite-shm',
      'attraccess.sqlite-wal',
    ]);
    expect(await readFile(target + '-wal', 'utf8')).toBe('-wal');
  });

  it('never overwrites an earlier backup: the new names carry a UTC timestamp', async () => {
    await mkdir(join(root, 'sqlite-backup'));
    await writeFile(join(root, 'sqlite-backup', 'attraccess.sqlite-wal'), 'earlier');
    await writeFile(file + '-wal', 'new');

    const target = await moveToBackup(file, now);

    expect(target).toBe(join(root, 'sqlite-backup', 'attraccess-20261121T093000123Z.sqlite'));
    expect(await readFile(join(root, 'sqlite-backup', 'attraccess.sqlite-wal'), 'utf8')).toBe('earlier');
    expect(await readFile(target + '-wal', 'utf8')).toBe('new');
  });

  it('fails instead of overwriting when the timestamped name is taken too', async () => {
    await mkdir(join(root, 'sqlite-backup'));
    await writeFile(join(root, 'sqlite-backup', 'attraccess.sqlite'), 'one');
    await writeFile(join(root, 'sqlite-backup', 'attraccess-20261121T093000123Z.sqlite'), 'two');

    await expect(moveToBackup(file, now)).rejects.toThrow('already exists');
    expect(await readFile(file, 'utf8')).toBe('data');
  });

  it('names where the SQLite file is now when a -wal file cannot follow it', async () => {
    await writeFile(file + '-wal', 'wal');
    failRenameOf = file + '-wal';

    const failure = await moveToBackup(file, now).catch((error: unknown) => error);

    const target = join(root, 'sqlite-backup', 'attraccess.sqlite');
    expect(failure).toBeInstanceOf(PartialBackupMoveError);
    expect((failure as PartialBackupMoveError).location).toBe(target);
    expect((failure as Error).message).toBe(`${file}-wal did not follow it: EACCES: permission denied`);
    expect(await readFile(target, 'utf8')).toBe('data');
  });
});
