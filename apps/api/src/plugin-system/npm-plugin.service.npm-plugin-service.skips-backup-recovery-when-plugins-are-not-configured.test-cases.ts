import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerSkipsBackupRecoveryWhenPluginsAreNotConfiguredCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('skips backup recovery when plugins are not configured', async () => {
    PluginService.configure({ PLUGIN_DIR: '', RESTART_BY_EXIT: true });

    await expect(NpmPluginService.recoverBackups()).resolves.toBeUndefined();
  });
}
