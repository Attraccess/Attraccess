// jest.mock is hoisted before imports — keep it here.
/* eslint-disable import/first */
jest.mock('electron', () => ({
  app: {
    relaunch: jest.fn(),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/opt/attraccess/companion.AppImage'),
  },
}));

jest.mock('fs', () => ({
  copyFileSync: jest.fn(),
  chmodSync: jest.fn(),
  renameSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('./linux-lock', () => ({
  tryLockSession: jest.fn(),
  installDesktopAutostart: jest.fn(),
  tryVtLock: jest.fn(),
  releaseVtLock: jest.fn(),
}));

import { LinuxAdapter } from './linux-adapter';
import { app } from 'electron';
import * as fs from 'fs';
/* eslint-enable import/first */

beforeEach(() => jest.clearAllMocks());

describe('LinuxAdapter.applyUpdate', () => {
  it('replaces AppImage in-place atomically and relaunches', async () => {
    const allowQuit = jest.fn();
    await new LinuxAdapter().applyUpdate('/tmp/update.AppImage', '2.0.0', allowQuit);

    expect(fs.copyFileSync).toHaveBeenCalledWith('/tmp/update.AppImage', '/opt/attraccess/companion.AppImage.tmp');
    expect(fs.chmodSync).toHaveBeenCalledWith('/opt/attraccess/companion.AppImage.tmp', 0o755);
    expect(fs.renameSync).toHaveBeenCalledWith('/opt/attraccess/companion.AppImage.tmp', '/opt/attraccess/companion.AppImage');
    expect(app.relaunch).toHaveBeenCalledWith({ execPath: '/opt/attraccess/companion.AppImage' });
    expect(allowQuit).toHaveBeenCalled();
    expect(app.quit).toHaveBeenCalled();
  });

  it('falls back to running from temp path when in-place replace fails', async () => {
    (fs.copyFileSync as jest.Mock).mockImplementation(() => { throw new Error('EACCES'); });

    const allowQuit = jest.fn();
    await new LinuxAdapter().applyUpdate('/tmp/update.AppImage', '2.0.0', allowQuit);

    expect(app.relaunch).toHaveBeenCalledWith({ execPath: '/tmp/update.AppImage' });
    expect(allowQuit).toHaveBeenCalled();
    expect(app.quit).toHaveBeenCalled();
  });
});
