import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
jest.mock('child_process', () => ({ spawn: mockSpawn }));

const mockSpawn = jest.fn(() => ({ unref: jest.fn() }));
const { PluginService } = jest.requireActual<typeof import('./plugin.service')>('./plugin.service');

const VALID_MANIFEST = {
  name: 'uploaded-plugin',
  version: '1.2.3',
  main: {
    frontend: { directory: 'frontend', entryPoint: 'index.mjs' },
    backend: { directory: 'dist', entryPoint: 'index.js' },
  },
  attraccessVersion: { min: '1.0.0' },
  permissions: [PluginPermission.EMIT_EVENTS],
};

function newPluginDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-service-'));
  PluginService.configure({ PLUGIN_DIR: dir, RESTART_BY_EXIT: true });
  return dir;
}

function writePlugin(root: string, folder: string, manifest: unknown): void {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest));
}
export function registerPluginServiceFixture() {
  let root: string;

  let exitSpy: jest.SpyInstance;

  let restartSpy: jest.SpyInstance;

  let capturedRestart: (() => void) | null;

  function flushScheduledRestart(): void {
    expect(capturedRestart).not.toBeNull();
    (capturedRestart as () => void)();
  }

  beforeEach(() => {
    mockSpawn.mockClear();
    capturedRestart = null;
    root = newPluginDir();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as unknown as never);
    restartSpy = jest
      .spyOn(PluginService.prototype as unknown as { restartApp: () => void }, 'restartApp')
      .mockImplementation(() => undefined);
    const realSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: (...a: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 1000) {
        capturedRestart = () => fn();
        return 0 as unknown as NodeJS.Timeout;
      }
      return realSetTimeout(fn, delay as number, ...args);
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    get mockSpawn() {
      return mockSpawn;
    },
    get VALID_MANIFEST() {
      return VALID_MANIFEST;
    },
    get writePlugin() {
      return writePlugin;
    },
    get root() {
      return root;
    },
    get exitSpy() {
      return exitSpy;
    },
    get restartSpy() {
      return restartSpy;
    },
    get flushScheduledRestart() {
      return flushScheduledRestart;
    },
  };
}
