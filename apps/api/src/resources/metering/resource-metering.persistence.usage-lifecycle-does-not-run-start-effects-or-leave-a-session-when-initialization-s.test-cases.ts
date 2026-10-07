import { BadRequestException } from '@nestjs/common';
import { ResourceMeteringSession, ResourceUsage } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
import { Handler } from './resource-metering.persistence.spec';

export function registerUsageLifecycleDoesNotRunStartEffectsOrLeaveASessionWhenInitializationS(
  scope: UsageLifecycleTestScope,
): void {
  it.each([
    [
      'fails',
      async () => {
        throw new Error('modbus offline');
      },
    ],
    ['finishes without acknowledging', async () => undefined],
  ])('does not run start effects or leave a session when initialization %s', async (_name, handler) => {
    await scope.seedMeter();
    scope.onStart = handler as Handler;
    await expect(scope.start()).rejects.toBeInstanceOf(BadRequestException);
    expect(scope.log).toEqual(['meter:start']);
    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}
