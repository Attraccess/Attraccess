import { NotFoundException } from '@nestjs/common';
import { ResourceHealthSource, ResourceHealthStatus } from '@attraccess/database-entities';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import { registerResourceHealthServiceFixture } from './resource-health.service.resource-health-service.test-fixture';

export function registerClearEntryCases(fixture: ReturnType<typeof registerResourceHealthServiceFixture>) {
  describe('clearEntry', () => {
    it('throws NotFoundException when entry does not exist', async () => {
      await expect(fixture.service.clearEntry(1, 999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes the entry and emits a healthy transition event when previously unhealthy', async () => {
      const emitSpy = jest.spyOn(fixture.eventEmitter, 'emit');
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'ir-bridge',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'gone',
        source: ResourceHealthSource.HEARTBEAT,
      });
      emitSpy.mockClear();

      const entryId = fixture.records[0].id;
      await fixture.service.clearEntry(1, entryId);

      expect(fixture.records).toHaveLength(0);
      expect(emitSpy).toHaveBeenCalledWith(
        ResourceHealthChangedEvent.EVENT_NAME,
        expect.objectContaining({
          resourceId: 1,
          identifier: 'ir-bridge',
          status: ResourceHealthStatus.HEALTHY,
          previousStatus: ResourceHealthStatus.UNHEALTHY,
        }),
      );
      expect(fixture.audit.recordResource).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'health.transition', subjectId: 1 }),
      );
    });

    it('does not emit a transition event when entry was already healthy', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'ir-bridge',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      const emitSpy = jest.spyOn(fixture.eventEmitter, 'emit');
      emitSpy.mockClear();

      const entryId = fixture.records[0].id;
      await fixture.service.clearEntry(1, entryId);

      expect(fixture.records).toHaveLength(0);
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('does not delete entries belonging to other resources', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'ir-bridge',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'broken',
        source: ResourceHealthSource.MANUAL,
      });
      const entryId = fixture.records[0].id;
      await expect(fixture.service.clearEntry(2, entryId)).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.records).toHaveLength(1);
    });
  });
}

export function registerGetSummaryCases(fixture: ReturnType<typeof registerResourceHealthServiceFixture>) {
  describe('getSummary', () => {
    it('throws NotFoundException when resource does not exist', async () => {
      await expect(fixture.service.getSummary(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports healthy when no entries exist', async () => {
      const summary = await fixture.service.getSummary(1);
      expect(summary.isHealthy).toBe(true);
      expect(summary.entries).toEqual([]);
      expect(summary.unhealthyEntries).toEqual([]);
    });

    it('separates healthy and unhealthy entries', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'a',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'b',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'broken',
        source: ResourceHealthSource.PAYLOAD,
      });

      const summary = await fixture.service.getSummary(1);
      expect(summary.isHealthy).toBe(false);
      expect(summary.entries).toHaveLength(2);
      expect(summary.unhealthyEntries).toHaveLength(1);
      expect(summary.unhealthyEntries[0].reason).toBe('broken');
    });
  });
}

export function registerIsResourceUnhealthyCases(fixture: ReturnType<typeof registerResourceHealthServiceFixture>) {
  describe('isResourceUnhealthy', () => {
    it('returns false when no entries exist', async () => {
      expect(await fixture.service.isResourceUnhealthy(1)).toBe(false);
    });

    it('returns true when at least one entry is unhealthy', async () => {
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'a',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await fixture.service.reportHealth({
        resourceId: 1,
        identifier: 'b',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'bad',
        source: ResourceHealthSource.MANUAL,
      });
      expect(await fixture.service.isResourceUnhealthy(1)).toBe(true);
    });

    it('does not consider unhealthy entries from other resources', async () => {
      await fixture.service.reportHealth({
        resourceId: 2,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'bad',
        source: ResourceHealthSource.MANUAL,
      });
      expect(await fixture.service.isResourceUnhealthy(1)).toBe(false);
    });
  });
}
