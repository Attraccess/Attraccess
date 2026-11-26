import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  clearFrontendSnapshots,
  FRONTEND_SNAPSHOT_DIRECTORY,
  frontendAssetRoot,
  snapshotPluginFrontend,
} from './frontend-snapshots';

describe('plugin frontend snapshots', () => {
  let pluginPath: string;
  const plugin = { pluginDirectory: 'demo', main: { frontend: { directory: join('demo', 'frontend') } } };
  const writeBundle = (content: string) => {
    mkdirSync(join(pluginPath, 'demo', 'frontend'), { recursive: true });
    writeFileSync(join(pluginPath, 'demo', 'frontend', 'index.js'), content);
  };

  beforeEach(() => {
    pluginPath = mkdtempSync(join(tmpdir(), 'frontend-snapshots-'));
  });
  afterEach(() => rmSync(pluginPath, { recursive: true, force: true }));

  it('serves from the plugin folder while nothing replaced it', () => {
    writeBundle('v1');
    expect(frontendAssetRoot(pluginPath, plugin)).toBe(pluginPath);
  });

  it('keeps the running version after an update replaced the folder, also across a second update', () => {
    writeBundle('v1');
    snapshotPluginFrontend(pluginPath, plugin);
    writeBundle('v2');
    snapshotPluginFrontend(pluginPath, plugin);

    const root = frontendAssetRoot(pluginPath, plugin);
    expect(root).toBe(join(pluginPath, FRONTEND_SNAPSHOT_DIRECTORY));
    expect(readFileSync(join(root, 'demo', 'frontend', 'index.js'), 'utf8')).toBe('v1');
  });

  it('skips plugins without a frontend and drops every snapshot at boot', () => {
    snapshotPluginFrontend(pluginPath, { pluginDirectory: 'backend-only', main: {} });
    snapshotPluginFrontend(pluginPath, undefined);
    writeBundle('v1');
    snapshotPluginFrontend(pluginPath, plugin);

    clearFrontendSnapshots(pluginPath);
    expect(frontendAssetRoot(pluginPath, plugin)).toBe(pluginPath);
  });
});
