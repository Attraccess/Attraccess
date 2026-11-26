import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  clearFrontendSnapshots,
  FRONTEND_SNAPSHOT_DIRECTORY,
  frontendAssetRoot,
  snapshotPluginFrontend,
  snapshotRunningFrontend,
} from './frontend-snapshots';

describe('plugin frontend snapshots', () => {
  let base: string;
  let pluginPath: string;
  const plugin = { pluginDirectory: 'demo', main: { frontend: { directory: join('demo', 'frontend') } } };
  const writeBundle = (content: string) => {
    mkdirSync(join(pluginPath, 'demo', 'frontend'), { recursive: true });
    writeFileSync(join(pluginPath, 'demo', 'frontend', 'index.js'), content);
  };
  const snapshots = () => join(pluginPath, FRONTEND_SNAPSHOT_DIRECTORY);

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'frontend-snapshots-'));
    pluginPath = join(base, 'plugins');
    mkdirSync(pluginPath);
  });
  afterEach(() => {
    clearFrontendSnapshots(pluginPath);
    rmSync(base, { recursive: true, force: true });
  });

  it('serves from the plugin folder while nothing replaced it', async () => {
    writeBundle('v1');
    expect(frontendAssetRoot(pluginPath, plugin)).toBe(pluginPath);
  });

  it('keeps the running version after an update replaced the folder, also across a second update', async () => {
    writeBundle('v1');
    await snapshotRunningFrontend(pluginPath, [plugin], 'demo');
    writeBundle('v2');
    await snapshotRunningFrontend(pluginPath, [plugin], 'demo');

    const root = frontendAssetRoot(pluginPath, plugin);
    expect(root).toBe(snapshots());
    expect(readFileSync(join(root, 'demo', 'frontend', 'index.js'), 'utf8')).toBe('v1');
    expect(readdirSync(snapshots()).filter((name) => name.startsWith('.staging-'))).toEqual([]);
  });

  it('skips plugins without a frontend and drops every snapshot at boot', async () => {
    await snapshotPluginFrontend(pluginPath, { pluginDirectory: 'backend-only', main: {} });
    await snapshotRunningFrontend(pluginPath, [], 'unknown');
    writeBundle('v1');
    await snapshotPluginFrontend(pluginPath, plugin);

    clearFrontendSnapshots(pluginPath);
    expect(frontendAssetRoot(pluginPath, plugin)).toBe(pluginPath);
  });

  it('never serves a snapshot this process did not take', async () => {
    writeBundle('v2');
    mkdirSync(join(snapshots(), 'demo', 'frontend'), { recursive: true });
    writeFileSync(join(snapshots(), 'demo', 'frontend', 'index.js'), 'left behind');

    expect(frontendAssetRoot(pluginPath, plugin)).toBe(pluginPath);
  });

  it('copies nothing from outside the plugin folder', async () => {
    mkdirSync(join(base, 'outside'));
    writeFileSync(join(base, 'outside', 'secret'), 'x');
    mkdirSync(join(pluginPath, 'demo'));
    const escaping = {
      pluginDirectory: 'demo',
      main: { frontend: { directory: join('demo', '..', '..', 'outside') } },
    };

    await snapshotPluginFrontend(pluginPath, escaping);

    expect(readdirSync(base).sort()).toEqual(['outside', 'plugins']);
    expect(frontendAssetRoot(pluginPath, escaping)).toBe(pluginPath);
  });

  it('copies a frontend folder that is a symlink inside the plugin by its target', async () => {
    mkdirSync(join(pluginPath, 'demo', 'dist'), { recursive: true });
    writeFileSync(join(pluginPath, 'demo', 'dist', 'index.js'), 'v1');
    symlinkSync('dist', join(pluginPath, 'demo', 'frontend'));

    await snapshotPluginFrontend(pluginPath, plugin);

    expect(readFileSync(join(snapshots(), 'demo', 'frontend', 'index.js'), 'utf8')).toBe('v1');
  });

  it('leaves no partial snapshot when the copy fails, and does not serve one', async () => {
    writeBundle('v1');
    // Node's copy refuses a named pipe (also when run as root, unlike an unreadable folder).
    execFileSync('mkfifo', [join(pluginPath, 'demo', 'frontend', 'pipe')]);

    await snapshotRunningFrontend(pluginPath, [plugin], 'demo');

    expect(frontendAssetRoot(pluginPath, plugin)).toBe(pluginPath);
    expect(readdirSync(snapshots()).filter((name) => name.startsWith('.staging-'))).toEqual([]);
  });
});
