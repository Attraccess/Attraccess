import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { main, parseArgs, resolvePort } from './dev-serve.mts';

const state = vi.hoisted(() => ({
  spawn: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
  free: vi.fn(),
  available: vi.fn(),
}));
vi.mock('node:child_process', () => ({ spawn: state.spawn }));
vi.mock('node:fs', () => ({ writeFileSync: state.write, rmSync: state.remove }));
vi.mock('./lib/find-free-port.mts', () => ({ findFreePort: state.free, isPortFree: state.available }));
let child: EventEmitter & { killed: boolean; kill: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['PORT', 'VITE_PORT', 'VITE_PREVIEW_PORT', 'ATT_TEST_PORT']) vi.stubEnv(name, '');
  child = Object.assign(new EventEmitter(), { killed: false, kill: vi.fn() });
  state.spawn.mockReturnValue(child);
  state.free.mockImplementation(async (start: number) => start + 2);
  state.available.mockResolvedValue(true);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(process, 'on').mockReturnValue(process);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('development server launcher', () => {
  it('parses targets, TUI, and passthrough arguments including a delimiter', () => {
    expect(parseArgs(['node', 'script'])).toEqual({ only: 'both', tui: false, passthroughArgs: [] });
    for (const only of ['api', 'frontend', 'both'])
      expect(parseArgs(['node', 'script', `--only=${only}`, '--tui', '--verbose', '--', '--only=unchanged'])).toEqual({
        only,
        tui: true,
        passthroughArgs: ['--verbose', '--only=unchanged'],
      });
    expect(() => parseArgs(['node', 'script', '--only'])).toThrow('requires a value');
    expect(() => parseArgs(['node', 'script', '--only=other'])).toThrow('Invalid value');
  });
  it('finds a free port unless an explicit valid port is requested', async () => {
    expect(await resolvePort('ATT_TEST_PORT', 5000, 'Test')).toBe(5002);
    vi.stubEnv('ATT_TEST_PORT', '5100');
    expect(await resolvePort('ATT_TEST_PORT', 5000, 'Test')).toBe(5100);
    expect(state.available).toHaveBeenCalledWith(5100);
    state.available.mockResolvedValue(false);
    await expect(resolvePort('ATT_TEST_PORT', 5000, 'Test')).rejects.toThrow('already in use');
    for (const value of ['0', '65536', '1.5', 'bad']) {
      vi.stubEnv('ATT_TEST_PORT', value);
      await expect(resolvePort('ATT_TEST_PORT', 5000, 'Test')).rejects.toThrow('not a valid port');
    }
  });
  it.each(['both', 'api', 'frontend'])('starts %s with isolated port metadata and environment', async (only) => {
    vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'script', `--only=${only}`, '--verbose']);
    await main();
    const [command, args, options] = state.spawn.mock.calls[0];
    expect(command).toBe('pnpm');
    expect(args).toEqual([
      'nx',
      'run-many',
      '-t',
      'serve',
      `--projects=${only === 'both' ? 'api,frontend' : only}`,
      '--outputStyle=stream',
      '--verbose',
    ]);
    const ports = JSON.parse(state.write.mock.calls[0][1]);
    if (only !== 'frontend') {
      expect(ports.api.port).toBe(3002);
      expect(options.env.PORT).toBe('3002');
    } else expect(ports.api).toBeUndefined();
    if (only !== 'api') {
      expect(ports.frontend.port).toBe(4202);
      expect(ports.preview.port).toBe(4302);
    } else expect(ports.frontend).toBeUndefined();
    if (only === 'both') expect(options.env.VITE_API_PROXY_TARGET).toBe('http://localhost:3002');
    expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });
  it('enables the terminal UI explicitly', async () => {
    vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'script', '--tui']);
    await main();
    expect(state.spawn.mock.calls[0][1]).toContain('--tui');
    expect(state.spawn.mock.calls[0][2].env.NX_TUI).toBe('true');
  });
});
