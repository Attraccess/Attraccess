import { MeterDefinitionTestScope } from './resource-metering.persistence.spec';
export function registerMeterDefinitionAppliesTheDocumentedDefaultsToTriggerSettings(
  scope: MeterDefinitionTestScope,
): void {
  it('applies the documented defaults to trigger settings', async () => {
    await scope.seedMeter({}, {});
    const { start, collect } = await scope.metering.getDefinition(1, 1);
    expect(start.timeoutSeconds).toBe(30);
    expect(collect).toEqual({
      meterId: 1,
      timeoutSeconds: 30,
      interimIntervalMinutes: 1,
      finalAttempts: 3,
      finalRetryDelaySeconds: 5,
    });
  });
}
