import { WindowsAdapter } from './windows-adapter';
import { app, shell } from 'electron';

jest.mock('electron', () => ({
  app: { quit: jest.fn() },
  shell: { openPath: jest.fn() },
}));

describe('WindowsAdapter.applyUpdate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls allowQuit before app.quit on success', async () => {
    const calls: string[] = [];
    (shell.openPath as jest.Mock).mockResolvedValue('');
    (app.quit as jest.Mock).mockImplementation(() => calls.push('quit'));

    await new WindowsAdapter().applyUpdate('/tmp/update.exe', '2.0.0', () => calls.push('allowQuit'));

    expect(calls).toEqual(['allowQuit', 'quit']);
  });

  it('does not call allowQuit or app.quit when shell.openPath fails', async () => {
    (shell.openPath as jest.Mock).mockResolvedValue('some error message');

    const allowQuit = jest.fn();
    await new WindowsAdapter().applyUpdate('/tmp/update.exe', '2.0.0', allowQuit);

    expect(allowQuit).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });
});
