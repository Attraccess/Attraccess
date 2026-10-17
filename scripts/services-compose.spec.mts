// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App, handleAction, main, resolveSelectedServices } from './services-compose.mts';

const state = vi.hoisted(() => ({
  exec: vi.fn(),
  exists: vi.fn(),
  exit: vi.fn(),
  render: vi.fn(),
  inputs: new Set<(input: string, key: Record<string, boolean>) => void>(),
}));
vi.mock('util', async (original) => {
  const actual = await original<typeof import('util')>();
  const methods = { ...actual, promisify: () => state.exec };
  return { ...methods, default: methods };
});
vi.mock('fs', async (original) => {
  const methods = { ...(await original<typeof import('fs')>()), existsSync: state.exists };
  return { ...methods, default: methods };
});
vi.mock('ink', async () => {
  const { createElement, useEffect } = await import('react');
  return {
    Box: ({ children }: { children: import('react').ReactNode }) => createElement('div', null, children),
    Text: ({ children }: { children: import('react').ReactNode }) => createElement('span', null, children),
    useApp: () => ({ exit: state.exit }),
    render: state.render,
    useInput: (handler: (input: string, key: Record<string, boolean>) => void) =>
      useEffect(() => {
        state.inputs.add(handler);
        return () => {
          state.inputs.delete(handler);
        };
      }, [handler]),
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  state.exists.mockReturnValue(true);
  state.exec.mockImplementation(async (_command: string, args: string[]) => ({
    stdout: args.includes('config') ? 'mailpit\nvalkey\nkeycloak\n' : '',
    stderr: '',
  }));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  state.inputs.clear();
  vi.restoreAllMocks();
});
async function key(input = '', key: Record<string, boolean> = {}) {
  await act(async () => {
    for (const handler of [...state.inputs]) handler(input, key);
  });
}

it('resolves sets and individual services without duplicates and rejects unknown selectors', () => {
  expect(resolveSelectedServices(['mailpit', 'mailpit', 'valkey'], ['mailpit', 'valkey'])).toEqual([
    'mailpit',
    'valkey',
  ]);
  expect(resolveSelectedServices(['custom'], ['custom'])).toEqual(['custom']);
  expect(resolveSelectedServices(['all'], ['one', 'two'])).toEqual(['one', 'two']);
  expect(resolveSelectedServices(['authentik'], [])).toHaveLength(4);
  expect(() => resolveSelectedServices(['missing'], [])).toThrow('Unknown set or service');
});
it('starts selected services after stopping others and defaults to mailpit', async () => {
  expect(await handleAction('up', [])).toBe('Started: mailpit');
  expect(state.exec.mock.calls.map(([, args]) => args.slice(3))).toEqual([
    ['config', '--services'],
    ['stop', 'valkey', 'keycloak'],
    ['up', '-d', 'mailpit'],
  ]);
  state.exec.mockClear();
  await handleAction('up', ['all']);
  expect(state.exec.mock.calls).toHaveLength(2);
});
it('lists, inspects, stops selected services, and shuts down the compose stack', async () => {
  expect(await handleAction('list', [])).toContain('authentik: authentik-postgresql');
  expect(await handleAction('status', [])).toBe('No running services.');
  expect(await handleAction('stop', ['valkey'])).toBe('Stopped: valkey');
  expect(await handleAction('down', [])).toBe('All services stopped.');
  expect(state.exec).toHaveBeenCalledWith('docker', expect.arrayContaining(['stop', 'valkey']), expect.any(Object));
  expect(state.exec).toHaveBeenCalledWith('docker', expect.arrayContaining(['down']), expect.any(Object));
});
it('rejects missing compose files and empty service inventories before mutations', async () => {
  state.exists.mockReturnValue(false);
  await expect(handleAction('up', [])).rejects.toThrow('Compose file not found');
  expect(state.exec).not.toHaveBeenCalled();
  state.exists.mockReturnValue(true);
  state.exec.mockResolvedValue({ stdout: '', stderr: '' });
  await expect(handleAction('up', [])).rejects.toThrow('No services found');
});
it('runs explicit CLI commands and help without opening a TUI', async () => {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'script', 'status']);
  await main();
  expect(console.log).toHaveBeenCalledWith('No running services.');
  vi.mocked(process.argv).splice(2, 1, '--help');
  await main();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Usage: pnpm services'));
  expect(state.render).not.toHaveBeenCalled();
});
it('selects service sets with keyboard navigation and returns from output to the menu', async () => {
  render(createElement(App));
  expect(screen.getByText('Select action:')).toBeTruthy();
  await key('', { return: true });
  expect(screen.getByText('Select service sets:')).toBeTruthy();
  await key(' '); // clear default mailpit
  await key('', { downArrow: true });
  await key(' '); // select valkey
  await key('', { return: true });
  expect(screen.getByText('Started: valkey')).toBeTruthy();
  await key('', { escape: true });
  expect(screen.getByText('Select action:')).toBeTruthy();
  await key('q');
  expect(state.exit).toHaveBeenCalled();
});
it('wraps menu navigation, toggles all sets, and displays action failures', async () => {
  render(createElement(App));
  await key('', { upArrow: true }); // list, wrap from first
  await key('', { downArrow: true }); // up, wrap from last
  await key('', { return: true });
  await key('', { upArrow: true });
  await key('', { downArrow: true });
  await key('a');
  await key('a');
  await key('a');
  state.exec.mockRejectedValue(new Error('fixture daemon unavailable'));
  await key('', { return: true });
  expect(screen.getByText('fixture daemon unavailable')).toBeTruthy();
  await key('x');
  expect(screen.getByText('Select action:')).toBeTruthy();
  state.exec.mockResolvedValue({ stdout: 'mailpit\n', stderr: '' });
  await key('', { upArrow: true }); // list executes without set selection
  await key('', { return: true });
  expect(screen.getByText('Done')).toBeTruthy();
});
