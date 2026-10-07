import { ResourceMeter } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersPreservesConcurrentConsumptionAndPricingWhenRenamingAMeter(
  scope: GenericMetersTestScope,
): void {
  it('preserves concurrent consumption and pricing when renaming a meter', async () => {
    const manager = scope.source.manager;
    const findOne = manager.findOne.bind(manager);
    jest.spyOn(manager, 'findOne').mockImplementationOnce(async (...args) => {
      const snapshot = await findOne(...args);
      await manager.update(ResourceMeter, 1, {
        lifetimeValue: '3000000000',
        counterValue: '3000000000',
        creditsPerUnit: 99,
      });
      return snapshot;
    });
    await scope.metering.updateMeter(1, 1, 'Renamed');
    expect((await scope.metering.listMeters(1))[0]).toEqual(
      expect.objectContaining({
        name: 'Renamed',
        lifetimeValue: '3',
        counterValue: '3',
        creditsPerUnit: 99,
      }),
    );
  });
}
