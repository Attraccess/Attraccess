import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRecordsAFailedUpdateCheckWhenReadingTheUpdatePolicyFailsCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('records a failed update check when reading the update policy fails', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockRejectedValue(new Error('Settings unavailable')),
    } as never);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      updateCheck: { state: 'failed', error: 'Settings unavailable' },
    });
  });
}
