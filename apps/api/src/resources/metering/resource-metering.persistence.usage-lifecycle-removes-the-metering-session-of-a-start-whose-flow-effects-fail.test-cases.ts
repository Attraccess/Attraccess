import { ResourceMeteringSession, ResourceUsage } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleRemovesTheMeteringSessionOfAStartWhoseFlowEffectsFail(
  scope: UsageLifecycleTestScope,
): void {
  it('removes the metering session of a start whose flow effects fail', async () => {
    await scope.seedMeter();
    // Ordinary flow errors are logged and swallowed by the usage service; an external-effect failure aborts.
    const { ExternalEffectFailureError } = await import('../flows/errors/external-effect-failure.error');
    scope.startEffects = async () => {
      throw new ExternalEffectFailureError('relay refused', new Error('cause'));
    };
    await expect(scope.start()).rejects.toBeInstanceOf(ExternalEffectFailureError);
    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}
