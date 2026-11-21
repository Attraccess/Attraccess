import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveToBackup, sqliteBackupDirectory } from './sqlite-backup';

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
});
