import { ResourceFlowEdge } from '@attraccess/database-entities';
import { registerFlowDefinedEnergyMeteringFixture } from './resource-metering.persistence.flow-defined-energy-metering.test-fixture';
export function registerMeterDefinitionCases(fixture: ReturnType<typeof registerFlowDefinedEnergyMeteringFixture>) {
  describe('meter definition', () => {
    it('is configured only when each trigger reaches its completion node', async () => {
      expect(await fixture.metering.getDefinition(1)).toEqual(
        expect.objectContaining({ configured: false, problems: ['start-trigger-missing', 'collect-trigger-missing'] }),
      );
      await fixture.seedMeter();
      expect(await fixture.metering.getDefinition(1)).toEqual(
        expect.objectContaining({ configured: true, problems: [] }),
      );
      await fixture.source.getRepository(ResourceFlowEdge).delete({ id: 'e1' });
      await fixture.source.getRepository(ResourceFlowEdge).delete({ id: 'e2' });
      expect((await fixture.metering.getDefinition(1)).problems).toEqual(['ready-unreachable', 'report-unreachable']);
    });

    it('applies the documented defaults to trigger settings', async () => {
      await fixture.seedMeter({}, {});
      const { start, collect } = await fixture.metering.getDefinition(1);
      expect(start.timeoutSeconds).toBe(30);
      expect(collect).toEqual({
        timeoutSeconds: 30,
        interimIntervalMinutes: 1,
        finalAttempts: 3,
        finalRetryDelaySeconds: 5,
      });
    });
  });
}
