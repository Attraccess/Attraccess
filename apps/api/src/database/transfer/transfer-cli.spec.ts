import { Logger } from '@nestjs/common';
import { PluginService } from '../../plugin-system/plugin.service';
import { waitForPostgres } from '../postgres/postgres-connection';
import { runTransfer } from './startup-transfer';
import { runTransferCommand } from './transfer-cli';
import { SqliteTransferError } from './transfer-errors';

jest.mock('./startup-transfer', () => ({ runTransfer: jest.fn() }));
jest.mock('../postgres/postgres-connection', () => ({ waitForPostgres: jest.fn() }));

const runTransferMock = runTransfer as jest.MockedFunction<typeof runTransfer>;
const waitMock = waitForPostgres as jest.MockedFunction<typeof waitForPostgres>;

describe('runTransferCommand', () => {
  const saved = { ...process.env };
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://user:hunter2@db.internal:5432/attraccess';
    process.env.STORAGE_ROOT = '/srv/attraccess';
    delete process.env.DATABASE_TYPE;
    runTransferMock.mockReset().mockResolvedValue(true);
    waitMock.mockReset().mockResolvedValue(undefined);
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(PluginService, 'configure').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  it('prints the usage and exits 0 for --help, without touching the database', async () => {
    await expect(runTransferCommand(['--help'])).resolves.toBe(0);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Usage: transfer-sqlite'));
    expect(waitMock).not.toHaveBeenCalled();
  });

  it('exits 2 with the usage for an unknown argument', async () => {
    await expect(runTransferCommand(['--bogus'])).resolves.toBe(2);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Usage: transfer-sqlite'));
    expect(runTransferMock).not.toHaveBeenCalled();
  });

  it('exits 2 for an option that needs a value', async () => {
    await expect(runTransferCommand(['--sqlite'])).resolves.toBe(2);
  });

  it('transfers the default file and refuses a non-empty target without --force', async () => {
    await expect(runTransferCommand([])).resolves.toBe(0);
    expect(waitMock).toHaveBeenCalledTimes(1);
    expect(runTransferMock).toHaveBeenCalledWith({
      sqliteFile: expect.stringMatching(/attraccess\.sqlite$/),
      whenTargetHasData: 'refuse',
      keepFile: undefined,
    });
  });

  it('passes the path, --force and --keep on', async () => {
    await expect(runTransferCommand(['--sqlite', '/tmp/old.sqlite', '--force', '--keep'])).resolves.toBe(0);
    expect(runTransferMock).toHaveBeenCalledWith({
      sqliteFile: '/tmp/old.sqlite',
      whenTargetHasData: 'replace',
      keepFile: true,
    });
  });

  it('exits 1 with a warning when there was nothing to transfer', async () => {
    runTransferMock.mockResolvedValue(false);
    await expect(runTransferCommand([])).resolves.toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Nothing was transferred'));
  });

  it('exits 1 and logs the message of a transfer error as it is', async () => {
    runTransferMock.mockRejectedValue(new SqliteTransferError('importing into PostgreSQL', 'boom'));
    await expect(runTransferCommand([])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('failed while importing into PostgreSQL: boom'));
    // The command is run again by hand; no start retries it.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('run the command again once the cause is fixed'));
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('next start'));
  });

  it('logs a refusal without promising a retry', async () => {
    runTransferMock.mockRejectedValue(
      new SqliteTransferError('checking the target', 'pass --force to replace it', { outcome: 'refused' }),
    );
    await expect(runTransferCommand([])).resolves.toBe(1);
    const [[message]] = error.mock.calls;
    expect(message).toContain('pass --force to replace it. Nothing was changed');
    expect(message).not.toMatch(/retr|run the command again/);
  });

  it('exits 1 for any other failure, prefixed, and never logs the URL', async () => {
    waitMock.mockRejectedValue(new Error('connection refused'));
    await expect(runTransferCommand([])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith('Transfer failed: connection refused');
    const everything = JSON.stringify([...error.mock.calls, ...stdout.mock.calls, ...stderr.mock.calls]);
    expect(everything).not.toContain('hunter2');
  });

  it('exits 1 when the configuration is missing', async () => {
    delete process.env.DATABASE_URL;
    await expect(runTransferCommand([])).resolves.toBe(1);
    expect(runTransferMock).not.toHaveBeenCalled();
  });
});
