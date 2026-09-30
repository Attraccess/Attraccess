// jest.mock is hoisted before imports — keep it here.
/* eslint-disable import/first */
jest.mock('child_process', () => ({ execFile: jest.fn() }));

import { execFile } from 'child_process';
import { lockWorkStation, installAutostart, isAutostartInstalled } from './windows-lock';
/* eslint-enable import/first */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExecFile = execFile as unknown as jest.Mock<any>;

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('win32');
});

afterAll(() => setPlatform('win32'));

// ─── lockWorkStation ──────────────────────────────────────────────────────────

describe('lockWorkStation', () => {
  it('returns false on non-Windows without calling execFile', async () => {
    setPlatform('darwin');
    expect(await lockWorkStation()).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('calls rundll32 user32.dll,LockWorkStation and returns true on success', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: null) => void) => cb(null));
    expect(await lockWorkStation()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'rundll32.exe',
      ['user32.dll,LockWorkStation'],
      expect.any(Function),
    );
  });

  it('returns false when rundll32 exits with an error', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: Error) => void) =>
      cb(new Error('fail')),
    );
    expect(await lockWorkStation()).toBe(false);
  });
});

// ─── installAutostart ─────────────────────────────────────────────────────────

describe('installAutostart', () => {
  it('is a no-op on non-Windows', async () => {
    setPlatform('linux');
    await installAutostart('C:\\app.exe');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('calls reg add with the run key and exe path', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: null) => void) => cb(null));
    await installAutostart('C:\\path\\app.exe');
    expect(mockExecFile).toHaveBeenCalledWith(
      'reg',
      expect.arrayContaining([
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v',
        'AttraccessCompanion',
        '/d',
        'C:\\path\\app.exe',
        '/f',
      ]),
      expect.any(Function),
    );
  });

  it('rejects when reg exits with an error', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: Error) => void) =>
      cb(new Error('Access denied')),
    );
    await expect(installAutostart('C:\\app.exe')).rejects.toThrow('Access denied');
  });
});

// ─── isAutostartInstalled ─────────────────────────────────────────────────────

describe('isAutostartInstalled', () => {
  it('returns false on non-Windows without calling execFile', async () => {
    setPlatform('darwin');
    expect(await isAutostartInstalled()).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns true when reg query succeeds', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: null) => void) => cb(null));
    expect(await isAutostartInstalled()).toBe(true);
  });

  it('returns false when reg query fails (key absent)', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: Error) => void) =>
      cb(new Error('not found')),
    );
    expect(await isAutostartInstalled()).toBe(false);
  });
});
