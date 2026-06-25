// jest.mock is hoisted before imports — keep it here.
/* eslint-disable import/first */
jest.mock('child_process', () => ({ execFile: jest.fn() }));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
}));

import { execFile } from 'child_process';
import * as fsp from 'fs/promises';
import {
  tryLockSession,
  installDesktopAutostart,
  isAutostartInstalled,
} from './linux-lock';
/* eslint-enable import/first */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExecFile = execFile as unknown as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockWriteFile = fsp.writeFile as unknown as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAccess = fsp.access as unknown as jest.Mock<any>;

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('linux');
});

afterAll(() => setPlatform('linux'));

// ─── tryLockSession ───────────────────────────────────────────────────────────

describe('tryLockSession', () => {
  it('returns false on non-Linux without calling execFile', async () => {
    setPlatform('win32');
    expect(await tryLockSession()).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns true and uses loginctl when it succeeds', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: null) => void) => cb(null));
    expect(await tryLockSession()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith('loginctl', ['lock-session'], expect.any(Function));
  });

  it('falls back to xdg-screensaver when loginctl fails', async () => {
    let callCount = 0;
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(callCount++ === 0 ? new Error('not found') : null);
    });
    expect(await tryLockSession()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockExecFile).toHaveBeenNthCalledWith(1, 'loginctl', ['lock-session'], expect.any(Function));
    expect(mockExecFile).toHaveBeenNthCalledWith(2, 'xdg-screensaver', ['lock'], expect.any(Function));
  });

  it('returns false when both loginctl and xdg-screensaver fail', async () => {
    mockExecFile.mockImplementation((_bin: string, _args: string[], cb: (err: Error) => void) =>
      cb(new Error('not found')),
    );
    expect(await tryLockSession()).toBe(false);
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });
});

// ─── installDesktopAutostart ──────────────────────────────────────────────────

describe('installDesktopAutostart', () => {
  it('is a no-op on non-Linux', async () => {
    setPlatform('darwin');
    await installDesktopAutostart('/usr/bin/app');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('writes a .desktop entry containing the exec path and GNOME autostart key', async () => {
    await installDesktopAutostart('/opt/attraccess/companion');
    const desktopCall = mockWriteFile.mock.calls.find((c: string[]) =>
      (c[0] as string).endsWith('.desktop'),
    );
    expect(desktopCall).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const content = desktopCall![1] as string;
    expect(content).toContain('Exec=/opt/attraccess/companion');
    expect(content).toContain('X-GNOME-Autostart-enabled=true');
    expect(content).toContain('[Desktop Entry]');
  });

  it('writes a systemd user service containing the exec path', async () => {
    await installDesktopAutostart('/opt/attraccess/companion');
    const serviceCall = mockWriteFile.mock.calls.find((c: string[]) =>
      (c[0] as string).endsWith('.service'),
    );
    expect(serviceCall).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const content = serviceCall![1] as string;
    expect(content).toContain('ExecStart=/opt/attraccess/companion');
    expect(content).toContain('[Install]');
    expect(content).toContain('WantedBy=default.target');
  });
});

// ─── isAutostartInstalled ─────────────────────────────────────────────────────

describe('isAutostartInstalled', () => {
  it('returns true when both autostart files are accessible', async () => {
    mockAccess.mockResolvedValue(undefined);
    expect(await isAutostartInstalled()).toBe(true);
  });

  it('returns false when either file is absent', async () => {
    mockAccess
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await isAutostartInstalled()).toBe(false);
  });
});
