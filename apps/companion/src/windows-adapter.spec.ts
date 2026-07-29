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

function makeChild(mode: 'success' | 'error') {
  const unref = jest.fn();
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const on = jest.fn((event: string, cb: (...args: unknown[]) => void) => {
    handlers[event] = cb;
    return { unref, on };
  });
  const child = { unref, on };
  // Emit the event asynchronously to simulate Node child_process behaviour
  if (mode === 'success') {
    setTimeout(() => handlers['spawn']?.(), 0);
  } else {
    setTimeout(() => handlers['error']?.(new Error('ENOENT')), 0);
  }
  return child;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WindowsAdapter.applyUpdate', () => {
  it('spawns installer with /S flag and calls allowQuit before app.quit', async () => {
    (spawn as jest.Mock).mockReturnValue(makeChild('success'));
    const calls: string[] = [];
    (app.quit as jest.Mock).mockImplementation(() => calls.push('quit'));

    await new WindowsAdapter().applyUpdate('/tmp/update.exe', '2.0.0', () => calls.push('allowQuit'));

    expect(spawn).toHaveBeenCalledWith('/tmp/update.exe', ['/S'], { detached: true, stdio: 'ignore' });
    expect(calls).toEqual(['allowQuit', 'quit']);
  });

  it('does NOT quit when the installer fails to spawn', async () => {
    (spawn as jest.Mock).mockReturnValue(makeChild('error'));

    await expect(
      new WindowsAdapter().applyUpdate('/tmp/update.exe', '2.0.0', jest.fn()),
    ).rejects.toThrow('ENOENT');

    expect(app.quit).not.toHaveBeenCalled();
  });
});
