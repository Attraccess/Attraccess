// jest.mock calls are hoisted by ts-jest before any module loads,
// so placing them before the imports they depend on is correct here.
/* eslint-disable import/first */
jest.mock('electron', () => ({
  systemPreferences: {
    isTrustedAccessibilityClient: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
}));

import * as fsp from 'fs/promises';
import {
  hasAccessibilityPermission,
  installLaunchAgent,
  isLaunchAgentInstalled,
} from './macos-lock';
/* eslint-enable import/first */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockWriteFile = fsp.writeFile as unknown as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAccess = fsp.access as unknown as jest.Mock<any>;

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('darwin');
});

afterAll(() => {
  setPlatform('darwin');
});

// ─── hasAccessibilityPermission ───────────────────────────────────────────────

describe('hasAccessibilityPermission', () => {
  it('returns true on non-macOS without consulting Electron', () => {
    setPlatform('win32');
    expect(hasAccessibilityPermission()).toBe(true);
  });

  it('delegates to systemPreferences.isTrustedAccessibilityClient on macOS', () => {
    expect(hasAccessibilityPermission()).toBe(true);
  });
});

// ─── installLaunchAgent ───────────────────────────────────────────────────────

describe('installLaunchAgent', () => {
  it('is a no-op on non-macOS', async () => {
    setPlatform('linux');
    await installLaunchAgent('/usr/bin/app');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('writes a plist containing the exec path and required keys', async () => {
    await installLaunchAgent('/Applications/Attraccess.app/Contents/MacOS/app');
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(content).toContain('/Applications/Attraccess.app/Contents/MacOS/app');
    expect(content).toContain('com.attraccess.companion');
    expect(content).toContain('<key>RunAtLoad</key>');
    expect(content).toContain('<true/>');
    // KeepAlive must NOT be set: it relaunches the app on every quit, trapping
    // the user in an unquittable loop. Login autostart only needs RunAtLoad.
    expect(content).not.toContain('KeepAlive');
  });
});

// ─── isLaunchAgentInstalled ───────────────────────────────────────────────────

describe('isLaunchAgentInstalled', () => {
  it('returns true when the plist file is accessible', async () => {
    mockAccess.mockResolvedValueOnce(undefined);
    expect(await isLaunchAgentInstalled()).toBe(true);
  });

  it('returns false when the plist file is absent', async () => {
    mockAccess.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await isLaunchAgentInstalled()).toBe(false);
  });
});
