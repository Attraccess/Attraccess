import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteTransferError } from './transfer-errors';
import { copyToWorkingDirectory, fileExists, markMigrated } from './sqlite-working-copy';

// rename, link and unlink call through to the real ones; the order of the calls is recorded.
jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual('node:fs/promises');
  return { ...actual, rename: jest.fn(actual.rename), link: jest.fn(actual.link), unlink: jest.fn(actual.unlink) };
});

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

    it('copies the rollback journal a killed 1.x container left, so SQLite rolls it back on the copy', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      await writeFile(`${original}-journal`, 'hot journal');

      const copy = await copyToWorkingDirectory(original);
      try {
        expect(await readFile(`${copy.file}-journal`, 'utf8')).toBe('hot journal');
      } finally {
        await copy.remove();
      }
      expect(await readFile(`${original}-journal`, 'utf8')).toBe('hot journal');
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

    it('fails, leaving no copy behind, when a side file cannot be checked instead of dropping a hot journal', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      // A journal name that cannot be stat'ed (ELOOP), like an unreadable storage mount (EACCES, EIO).
      await symlink(`${original}-journal`, `${original}-journal`);

      await expect(copyToWorkingDirectory(original)).rejects.toThrow(
        `cannot tell whether ${original}-journal exists (ELOOP); make the storage directory readable by the API`,
      );
      expect(await readFile(original)).toEqual(HEADER);
    });
  });

  describe('fileExists', () => {
    it('is true for a file and false only when there is no such file', async () => {
      const file = join(directory, 'present');
      await writeFile(file, 'x');
      await expect(fileExists(file)).resolves.toBe(true);
      await expect(fileExists(join(directory, 'absent'))).resolves.toBe(false);
      // A path below a file: nothing can exist there (ENOTDIR).
      await expect(fileExists(join(file, 'below'))).resolves.toBe(false);
    });

    it('throws when the directory cannot be read, naming the path and the code', async () => {
      const locked = join(directory, 'locked');
      await mkdir(locked);
      await chmod(locked, 0o000);
      try {
        await expect(fileExists(join(locked, 'attraccess.sqlite'))).rejects.toThrow(
          `cannot tell whether ${join(locked, 'attraccess.sqlite')} exists (EACCES)`,
        );
      } finally {
        await chmod(locked, 0o700);
      }
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

    it('renames the rollback journal with the file', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      await writeFile(`${original}-journal`, 'journal');

      const target = await markMigrated(original, new Date('2026-11-18T15:04:05Z'));

      expect((await readdir(directory)).sort()).toEqual([
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z',
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z-journal',
      ]);
      expect(await readFile(`${target}-journal`, 'utf8')).toBe('journal');
    });

    it('links every new name first, then drops the old database name before its side files', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      await writeFile(`${original}-journal`, 'journal');
      await writeFile(`${original}-wal`, 'wal');
      const calls: string[] = [];
      const name = (path: unknown) => String(path).slice(directory.length + 1);
      (link as jest.MockedFunction<typeof link>).mockClear();
      (unlink as jest.MockedFunction<typeof unlink>).mockClear();
      (link as jest.MockedFunction<typeof link>).mockImplementation(async (from, to) => {
        calls.push(`link ${name(from)}`);
        return jest.requireActual('node:fs/promises').link(from, to);
      });
      (unlink as jest.MockedFunction<typeof unlink>).mockImplementation(async (path) => {
        calls.push(`unlink ${name(path)}`);
        return jest.requireActual('node:fs/promises').unlink(path);
      });

      await markMigrated(original, new Date('2026-11-18T15:04:05Z'));

      expect(calls).toEqual([
        'link attraccess.sqlite',
        'link attraccess.sqlite-journal',
        'link attraccess.sqlite-wal',
        'unlink attraccess.sqlite',
        'unlink attraccess.sqlite-journal',
        'unlink attraccess.sqlite-wal',
      ]);
    });

    it('renames side files before the database file where the file system has no hard links', async () => {
      const original = join(directory, 'attraccess.sqlite');
      await writeFile(original, HEADER);
      await writeFile(`${original}-journal`, 'journal');
      await writeFile(`${original}-wal`, 'wal');
      const unsupported = Object.assign(new Error('not supported'), { code: 'EPERM' });
      (link as jest.MockedFunction<typeof link>).mockRejectedValueOnce(unsupported);
      const renamed = rename as jest.MockedFunction<typeof rename>;
      renamed.mockClear();

      await markMigrated(original, new Date('2026-11-18T15:04:05Z'));

      expect(renamed.mock.calls.map(([from]) => String(from).slice(directory.length + 1))).toEqual([
        'attraccess.sqlite-journal',
        'attraccess.sqlite-wal',
        'attraccess.sqlite',
      ]);
      expect((await readdir(directory)).sort()).toEqual([
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z',
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z-journal',
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z-wal',
      ]);
    });

    it('renames nothing and overwrites nothing when a target name already exists', async () => {
      const original = join(directory, 'attraccess.sqlite');
      const target = `${original}.migrated-to-postgres-20261118T150405Z`;
      await writeFile(original, HEADER);
      await writeFile(`${original}-journal`, 'journal');
      await writeFile(`${target}-journal`, 'an older journal');

      await expect(markMigrated(original, new Date('2026-11-18T15:04:05Z'))).rejects.toThrow(
        `${target}-journal already exists; the SQLite file was not renamed`,
      );

      expect((await readdir(directory)).sort()).toEqual([
        'attraccess.sqlite',
        'attraccess.sqlite-journal',
        'attraccess.sqlite.migrated-to-postgres-20261118T150405Z-journal',
      ]);
      expect(await readFile(`${target}-journal`, 'utf8')).toBe('an older journal');
    });
  });
});
