import 'reflect-metadata';
import type { ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope } from './production-fleet.spec';
export function registerMarksUnchangedProductionSamplesStaleAndRefusesToSatisfyAWaitAfterTheirFreshnessWindow(
  scope: ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope,
): void {
  it('marks unchanged production samples stale and refuses to satisfy a wait after their freshness window', async () => {
    const sample = scope.required(scope.flow.read(scope.query('power', 'measurement')));
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 90_001);
    try {
      expect(scope.flow.payload(sample)).toMatchObject({ available: false, stale: true, connectionStale: true });
      await expect(
        scope.flow.wait({ ...scope.query('power', 'measurement'), equals: 13625, timeoutMs: 30 }),
      ).resolves.toBeNull();
    } finally {
      clock.mockRestore();
    }
    expect(scope.errors).toEqual([]);
  });
}
