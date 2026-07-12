// jest.mock is hoisted before imports — keep it here.
/* eslint-disable import/first */
jest.mock('electron', () => ({
  app: { relaunch: jest.fn(), quit: jest.fn() },
  dialog: { showMessageBox: jest.fn().mockResolvedValue({ response: 0 }) },
  shell: { openPath: jest.fn().mockResolvedValue('') },
}));

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('./macos-lock', () => ({
  hasAccessibilityPermission: jest.fn().mockReturnValue(true),
  promptAccessibilityPermission: jest.fn(),
  installLaunchAgent: jest.fn(),
}));

import { MacosAdapter } from './macos-adapter';
import { app, dialog, shell } from 'electron';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
/* eslint-enable import/first */

beforeEach(() => jest.clearAllMocks());

describe('MacosAdapter.applyUpdate', () => {
  it('mounts DMG, copies app bundle in-place via ditto, and relaunches', async () => {
    (execFileSync as jest.Mock)
      .mockReturnValueOnce(undefined) // hdiutil attach
      .mockReturnValueOnce('/tmp/mnt/Attraccess.app') // find
      .mockReturnValueOnce(undefined) // ditto
      .mockReturnValueOnce(undefined); // hdiutil detach

    const allowQuit = jest.fn();
    await new MacosAdapter().applyUpdate('/tmp/update.dmg', '2.0.0', allowQuit);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(execFileSync).toHaveBeenCalledWith('ditto', expect.any(Array));
    expect(app.relaunch).toHaveBeenCalled();
    expect(app.quit).toHaveBeenCalled();
    expect(shell.openPath).not.toHaveBeenCalled();
  });

  it('falls back to manual DMG dialog when hdiutil fails', async () => {
    (execFileSync as jest.Mock).mockImplementation(() => { throw new Error('hdiutil: command not found'); });

    await new MacosAdapter().applyUpdate('/tmp/update.dmg', '2.0.0', jest.fn());

    expect(shell.openPath).toHaveBeenCalledWith('/tmp/update.dmg');
    expect(dialog.showMessageBox).toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });
});
