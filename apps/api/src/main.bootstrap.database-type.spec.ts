import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runPendingUpMigrationsForAllPlugins = jest.fn();
jest.mock('./plugin-system/plugin-migration.service', () => ({
  PluginMigrationService: { runPendingUpMigrationsForAllPlugins },
}));

/**
 * An unsupported DATABASE_TYPE stops the real bootstrap before any storage is created and before plugin migrations
 * run, and nothing it reports contains the value when that value is not a plain name (a misplaced connection string).
 */
describe('bootstrap with an unsupported DATABASE_TYPE', () => {
  const secret = 'postgres://attraccess:hunter2@db.example/attraccess';
  const previous = { ...process.env };
  let storage: string;
  const output: string[] = [];

  beforeEach(() => {
    storage = mkdtempSync(join(tmpdir(), 'attraccess-database-type-'));
    process.env = {
      ...previous,
      DATABASE_TYPE: secret,
      STORAGE_ROOT: storage,
      PLUGIN_DIR: join(storage, 'plugins'),
      AUTH_SESSION_SECRET: 'session-secret-for-test',
    };
    for (const stream of [process.stdout, process.stderr]) {
      jest.spyOn(stream, 'write').mockImplementation((chunk: string | Uint8Array) => {
        output.push(String(chunk));
        return true;
      });
    }
    for (const method of ['error', 'warn', 'log'] as const) {
      jest
        .spyOn(console, method)
        .mockImplementation((...args: unknown[]) => void output.push(args.map(String).join(' ')));
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...previous };
    rmSync(storage, { recursive: true, force: true });
  });

  it('fails before any storage or plugin migration, without echoing the value', async () => {
    let failure: unknown;
    await jest.isolateModulesAsync(async () => {
      try {
        const { bootstrap } = await import('./main.bootstrap');
        await bootstrap();
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain(
      'Unsupported DATABASE_TYPE (redacted: not a database type name). Supported values: postgres.',
    );
    expect(runPendingUpMigrationsForAllPlugins).not.toHaveBeenCalled();
    expect(readdirSync(storage)).toEqual([]);
    const reported = [message, (failure as Error).stack ?? '', ...output].join('\n');
    expect(reported).not.toContain('hunter2');
    expect(reported).not.toContain(secret);
  });
});
