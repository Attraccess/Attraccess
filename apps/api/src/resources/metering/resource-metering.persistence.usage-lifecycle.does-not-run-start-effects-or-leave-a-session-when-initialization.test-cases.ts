import type { Handler } from './metering-report-handlers.test-fixture';
import { ResourceMeteringSession, ResourceUsage } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { registerUsageLifecycleScopeFixture } from './resource-metering.persistence.usage-lifecycle-06b10e.test-fixture';
export function registerDoesNotRunStartEffectsOrLeaveASessionWhenInitializationPart3Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it.each([
    [
      'fails',
      async () => {
        throw new Error('modbus offline');
      },
    ],
    ['finishes without acknowledging', async () => undefined],
  ])('does not run start effects or leave a session when initialization %s', async (_name, handler) => {
    await fixture.fixture.seedMeter();
    fixture.fixture.onStart = handler as Handler;
    await expect(fixture.start()).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.fixture.log).toEqual(['meter:start']);
    expect(await fixture.fixture.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await fixture.fixture.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}
