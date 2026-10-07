import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerLimitsSimultaneousUpdateChecksToFourInstallationsCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('limits simultaneous update checks to four installations', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify(
        Array.from({ length: 5 }, (_, index) => ({ name: `@attraccess/plugin-${index}`, version: '1.0.0' })),
      ),
    );
    let active = 0;
    let maximum = 0;
    jest.spyOn(service, 'checkInstalled').mockImplementation(async (name) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { name } as never;
    });

    await service.checkAllInstalled();

    expect(maximum).toBe(4);
  });
}
