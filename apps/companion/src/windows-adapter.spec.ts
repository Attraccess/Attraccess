// jest.mock is hoisted before imports — keep it here.
/* eslint-disable import/first */
jest.mock('electron', () => ({
  app: { quit: jest.fn() },
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('./windows-lock', () => ({
  lockWorkStation: jest.fn(),
  installAutostart: jest.fn(),
}));

import { WindowsAdapter } from './windows-adapter';
import { app } from 'electron';
import { spawn } from 'child_process';
/* eslint-enable import/first */

const mockUnref = jest.fn();
const mockOn = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (spawn as jest.Mock).mockReturnValue({ unref: mockUnref, on: mockOn });
});

describe('WindowsAdapter.applyUpdate', () => {
  it('spawns installer with /S flag and calls allowQuit before app.quit', async () => {
    const calls: string[] = [];
    (app.quit as jest.Mock).mockImplementation(() => calls.push('quit'));

    await new WindowsAdapter().applyUpdate('/tmp/update.exe', '2.0.0', () => calls.push('allowQuit'));

    expect(spawn).toHaveBeenCalledWith('/tmp/update.exe', ['/S'], { detached: true, stdio: 'ignore' });
    expect(mockUnref).toHaveBeenCalled();
    expect(calls).toEqual(['allowQuit', 'quit']);
  });
});
