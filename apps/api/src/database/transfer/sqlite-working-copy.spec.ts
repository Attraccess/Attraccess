import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteTransferError } from './transfer-errors';
import { copyToWorkingDirectory, markMigrated } from './sqlite-working-copy';

const HEADER = Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.from('page data')]);

describe('SQLite working copy', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'working-copy-spec-'));
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  describe('copyToWorkingDirectory', () => {
    it('copies the file with its -wal and -shm files to a private directory and leaves the original alone', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      await writeFile(`${original}-wal`, 'wal');
      await writeFile(`${original}-shm`, 'shm');

      const copy = await copyToWorkingDirectory(original);
      try {
        expect(copy.file).not.toBe(original);
        expect(await readFile(copy.file)).toEqual(HEADER);
        expect(await readFile(`${copy.file}-wal`, 'utf8')).toBe('wal');
        expect(await readFile(`${copy.file}-shm`, 'utf8')).toBe('shm');
        expect((await readdir(directory)).sort()).toEqual([
          'attraccess.sqlite',
          'attraccess.sqlite-shm',
          'attraccess.sqlite-wal',
        ]);
      } finally {
        await copy.remove();
      }
      await expect(stat(copy.file)).rejects.toThrow(/ENOENT/);
      expect(await readFile(original)).toEqual(HEADER);
    });

    it('copies a file without side files', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      const copy = await copyToWorkingDirectory(original);
      try {
        await expect(stat(`${copy.file}-wal`)).rejects.toThrow(/ENOENT/);
      } finally {
        await copy.remove();
      }
    });

    it('refuses a file that is not a SQLite database before copying anything', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, 'this is not a database, however long the text is');
      await expect(copyToWorkingDirectory(original)).rejects.toThrow(SqliteTransferError);
      await expect(copyToWorkingDirectory(original)).rejects.toThrow(/is not a SQLite database/);
      const tiny = join(directory, 'tiny.sqlite');
      await writeFile(tiny, 'SQLite');
      await expect(copyToWorkingDirectory(tiny)).rejects.toThrow(/is not a SQLite database/);
    });

    it('fails for a file that does not exist', async () => {
      await expect(copyToWorkingDirectory(join(directory, 'missing.sqlite'))).rejects.toThrow(/ENOENT/);
    });
  });

  describe('markMigrated', () => {
    it('renames the file and its side files to attraccess.sqlite.migrated-to-postgres-<UTC timestamp>', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      await writeFile(`${original}-wal`, 'wal');

      const target = await markMigrated(original, new Date('2026-11-18T15:04:05.678Z'));

      expect(target).toBe(`${original}.migrated-to-postgres-20261118T150405Z`);
      expect((await readdir(directory)).sort()).toEqual([
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z',
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z-wal',
      ]);
      expect(await readFile(target)).toEqual(HEADER);
    });
  });
});
