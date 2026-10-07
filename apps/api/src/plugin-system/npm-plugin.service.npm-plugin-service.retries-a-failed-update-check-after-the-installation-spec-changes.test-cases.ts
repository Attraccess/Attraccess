import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRetriesAFailedUpdateCheckAfterTheInstallationSpecChangesCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('retries a failed update check after the installation spec changes', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: '^1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: { '1.1.0': { version: '1.1.0' } },
    });
    let rejectCandidates: ((error: Error) => void) | undefined;
    jest
      .spyOn(service, 'installedVersionCandidates')
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectCandidates = reject;
          }),
      )
      .mockResolvedValue([]);

    const updateCheck = service.checkInstalled(name);
    await new Promise((resolve) => setImmediate(resolve));
    await service.updateRequestedSpec(name, '^1.1.0');
    if (!rejectCandidates) throw new Error('Expected update check to request candidates');
    rejectCandidates(new Error('Registry unavailable'));

    await expect(updateCheck).resolves.toMatchObject({
      requestedSpec: '^1.1.0',
      updateCheck: { state: 'up-to-date', error: null },
    });
  });
}
