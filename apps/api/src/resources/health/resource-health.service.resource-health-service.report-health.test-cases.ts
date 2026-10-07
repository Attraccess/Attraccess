import { ResourceHealthSource, ResourceHealthState, ResourceHealthStatus } from '@attraccess/database-entities';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import { registerResourceHealthServiceFixture } from './resource-health.service.resource-health-service.test-fixture';
export function registerReportHealthCases(fixture: ReturnType<typeof registerResourceHealthServiceFixture>) {
  describe('reportHealth', () => {
    it('creates a new healthy entry when none exists', async () => {
      const result = await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'ir-bridge',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });

      expect(result.identifier).toBe('ir-bridge');
      expect(result.status).toBe(ResourceHealthStatus.HEALTHY);
      expect(result.reason).toBeNull();
      expect(fixture.records).toHaveLength(1);
    });

    it('normalises empty/undefined identifiers to empty string', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: undefined,
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(fixture.records[0].identifier).toBe('');
    });

    it('trims identifier whitespace', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '  primary  ',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(fixture.records[0].identifier).toBe('primary');
    });

    it('clears reason when transitioning to healthy', async () => {
      fixture.records.push({
        id: 1,
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'broken',
        source: ResourceHealthSource.MANUAL,
        lastReportedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ResourceHealthState);

      const result = await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        reason: 'whatever',
        source: ResourceHealthSource.MANUAL,
      });

      expect(result.reason).toBeNull();
    });

    it('falls back to null reason when unhealthy with empty reason', async () => {
      const result = await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: '   ',
        source: ResourceHealthSource.MANUAL,
      });
      expect(result.reason).toBeNull();
    });

    it('emits ResourceHealthChangedEvent only when status changes', async () => {
      const emitSpy = jest.spyOn(fixture.eventEmitter, 'emit');

      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(emitSpy).toHaveBeenCalledWith(
        ResourceHealthChangedEvent.EVENT_NAME,
        expect.objectContaining({
          resourceId: 1,
          status: ResourceHealthStatus.HEALTHY,
          previousStatus: null,
        }),
      );

      emitSpy.mockClear();
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(emitSpy).not.toHaveBeenCalled();
      expect(fixture.audit.recordResource).toHaveBeenCalledTimes(1);

      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'ka-pow',
        source: ResourceHealthSource.MANUAL,
      });
      expect(emitSpy).toHaveBeenCalledWith(
        ResourceHealthChangedEvent.EVENT_NAME,
        expect.objectContaining({
          resourceId: 1,
          status: ResourceHealthStatus.UNHEALTHY,
          previousStatus: ResourceHealthStatus.HEALTHY,
          reason: 'ka-pow',
        }),
      );
      expect(fixture.audit.recordResource).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'health.transition',
          actorId: null,
          subjectId: 1,
          details: expect.objectContaining({
            previousStatus: ResourceHealthStatus.HEALTHY,
            status: ResourceHealthStatus.UNHEALTHY,
          }),
        }),
      );
    });

    it('updates an existing record without creating duplicates', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'gone',
        source: ResourceHealthSource.HEARTBEAT,
      });
      expect(fixture.records).toHaveLength(1);
      expect(fixture.records[0].source).toBe(ResourceHealthSource.HEARTBEAT);
      expect(fixture.records[0].reason).toBe('gone');
    });

    it('keeps separate records per identifier', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'ir-bridge',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'Internal',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'fault',
        source: ResourceHealthSource.MANUAL,
      });
      expect(fixture.records).toHaveLength(2);
    });
  });
}
