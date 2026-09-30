// jest.mock is hoisted before imports — keep it here.
/* eslint-disable import/first */
jest.mock('child_process', () => ({ execFile: jest.fn(), spawn: jest.fn() }));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
}));

import { execFile, spawn } from 'child_process';
import * as fsp from 'fs/promises';
import {
  tryLockSession,
  installDesktopAutostart,
  isAutostartInstalled,
  tryVtLock,
  releaseVtLock,
} from './linux-lock';
/* eslint-enable import/first */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExecFile = execFile as unknown as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSpawn = spawn as unknown as jest.Mock<any>;
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

// ─── VT lock helpers ──────────────────────────────────────────────────────────

type DataListener = (chunk: Buffer) => void;
type ExitListener = () => void;

interface MockProc {
  stdout: { on: jest.Mock };
  stdin: { end: jest.Mock };
  on: jest.Mock;
  kill: jest.Mock;
  _emitData: (s: string) => void;
  _emitExit: () => void;
}

function makeMockProc(): MockProc {
  const dataListeners: DataListener[] = [];
  const exitListeners: ExitListener[] = [];
  return {
    stdout: {
      on: jest.fn((event: string, listener: DataListener) => {
        if (event === 'data') dataListeners.push(listener);
      }),
    },
    stdin: { end: jest.fn() },
    on: jest.fn((event: string, listener: ExitListener) => {
      if (event === 'exit') exitListeners.push(listener);
    }),
    kill: jest.fn(),
    _emitData: (s: string) => dataListeners.forEach((l) => l(Buffer.from(s))),
    _emitExit: () => exitListeners.forEach((l) => l()),
  };
}

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

// ─── tryVtLock ───────────────────────────────────────────────────────────────

describe('tryVtLock', () => {
  afterEach(() => releaseVtLock());

  it('returns false on non-Linux without spawning', async () => {
    setPlatform('win32');
    expect(await tryVtLock()).toBe(false);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('returns true when python3 outputs "locked"', async () => {
    const proc = makeMockProc();
    mockSpawn.mockReturnValue(proc);

    const prom = tryVtLock();
    proc._emitData('locked\n');
    expect(await prom).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      ['-u', '-c', expect.any(String)],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'ignore'] }),
    );
  });

  it('returns false when python3 outputs an error', async () => {
    const proc = makeMockProc();
    mockSpawn.mockReturnValue(proc);

    const prom = tryVtLock();
    proc._emitData('err:perm\n');
    expect(await prom).toBe(false);
    expect(proc.kill).toHaveBeenCalled();
  });

  it('returns false when the process exits without output', async () => {
    const proc = makeMockProc();
    mockSpawn.mockReturnValue(proc);

    const prom = tryVtLock();
    proc._emitExit();
    expect(await prom).toBe(false);
  });

  it('returns true immediately when already locked (no second spawn)', async () => {
    const proc = makeMockProc();
    mockSpawn.mockReturnValue(proc);

    const prom = tryVtLock();
    proc._emitData('locked\n');
    expect(await prom).toBe(true);

    expect(await tryVtLock()).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});

// ─── releaseVtLock ────────────────────────────────────────────────────────────

describe('releaseVtLock', () => {
  afterEach(() => releaseVtLock());

  it('is a no-op when not locked', () => {
    expect(() => releaseVtLock()).not.toThrow();
  });

  it('ends stdin of the grab process on release', async () => {
    const proc = makeMockProc();
    mockSpawn.mockReturnValue(proc);

    const prom = tryVtLock();
    proc._emitData('locked\n');
    await prom;

    releaseVtLock();
    expect(proc.stdin.end).toHaveBeenCalled();
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
