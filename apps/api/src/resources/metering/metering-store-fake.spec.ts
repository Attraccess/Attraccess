import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ResourceMeteringSessionStatus, ResourceFlowNodeType } from '@attraccess/application-models';
import type { ResourceMeterRecord, ResourceMeteringSessionRecord } from '@attraccess/application-models';
import { MeteringCatalog } from './metering-catalog';
import { MeteringSegments } from './metering-segments';
import { MeteringSettlement } from './metering-settlement';
import { MeterNameTakenError, MeteringStore } from './metering-store.port';

const meter = (extra: Partial<ResourceMeterRecord> = {}): ResourceMeterRecord => ({
  id: 1,
  resourceId: 1,
  name: 'Energy',
  creditsPerUnit: 30,
  allocation: 'shared',
  lifetimeValue: '1500000000',
  counterValue: null,
  latestObservedAt: null,
  ...extra,
});

const waived = { id: 's1', usageId: 5, meterId: 1, latestValue: '2000000000', creditsPerUnit: 30 };

/** The services against a fake of the port: no database, no ORM. */
describe('Metering services on a fake metering store', () => {
  const store = (overrides: Partial<Record<keyof MeteringStore, jest.Mock>>) => overrides as unknown as MeteringStore;

  describe('catalog', () => {
    it('reports a taken name as a conflict', async () => {
      const catalog = new MeteringCatalog(
        store({
          resourceExists: jest.fn().mockResolvedValue(true),
          createMeter: jest.fn().mockRejectedValue(new MeterNameTakenError()),
        }),
      );
      await expect(catalog.createMeter(1, ' Energy ')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to create a meter on an unknown resource and a rate on an unknown meter', async () => {
      const catalog = new MeteringCatalog(
        store({ resourceExists: jest.fn().mockResolvedValue(false), findMeter: jest.fn().mockResolvedValue(null) }),
      );
      await expect(catalog.createMeter(9, 'x')).rejects.toThrow(new BadRequestException('RESOURCE_NOT_FOUND'));
      await expect(catalog.setRate(1, 9, 5)).rejects.toThrow(new BadRequestException('METER_NOT_FOUND'));
    });

    it('flags a shared meter that cannot be read on demand when the machine runs parallel sessions', async () => {
      const catalog = new MeteringCatalog(
        store({
          listMeters: jest.fn().mockResolvedValue([meter()]),
          findDefinitionFlow: jest.fn().mockResolvedValue({
            allNodes: [
              { id: 'r', type: ResourceFlowNodeType.OUTPUT_METERING_REPORT, data: { meterId: 1, mode: 'increment' } },
            ],
            edges: [],
          }),
          findSessionLimit: jest.fn().mockResolvedValue(3),
          findUnsettledSessions: jest.fn().mockResolvedValue([
            {
              id: 's1',
              meterId: 1,
              meterName: 'Energy',
              usageId: 5,
              status: ResourceMeteringSessionStatus.Pending,
              failureReason: 'no reading',
              latestValue: '1500000000',
            } as ResourceMeteringSessionRecord,
          ]),
        }),
      );
      const status = await catalog.getStatus(1);
      expect(status.meters[0]).toMatchObject({ configured: true, problems: ['shared-needs-collect'] });
      expect(status.unsettled).toEqual([
        {
          sessionId: 's1',
          meterId: 1,
          meterName: 'Energy',
          usageId: 5,
          status: 'pending',
          reason: 'no reading',
          latestValue: '1.5',
          retryable: true,
        },
      ]);
    });
  });

  describe('settlement', () => {
    const settlement = (waiveSession: jest.Mock, audit: { record: jest.Mock }) =>
      new MeteringSettlement(store({ waiveSession }), {} as never, audit as never, {} as never, new Logger('test'));

    it('audits the waiver with the credits it gives up', async () => {
      const audit = { record: jest.fn().mockResolvedValue({}) };
      const result = await settlement(jest.fn().mockResolvedValue(waived), audit).waive(1, 's1', 7);
      expect(result).toBe(waived);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'meter_charge.waived',
          actor: { id: 7, authenticationMethod: 'session' },
          details: { usageId: 5, meterId: 1, waivedCredits: 60 },
        }),
      );
    });

    it('refuses to waive a session that is neither pending nor failed, without auditing', async () => {
      const audit = { record: jest.fn() };
      await expect(settlement(jest.fn().mockResolvedValue(null), audit).waive(1, 's1', 7)).rejects.toThrow(
        new ConflictException('METER_SESSION_NOT_PENDING'),
      );
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('segments', () => {
    const running = (usageId: number, extra: Partial<ResourceMeteringSessionRecord> = {}) =>
      ({
        id: `s${usageId}`,
        usageId,
        meterId: 1,
        resourceId: 1,
        creditsPerUnit: 30,
        baselineValue: null,
        ...extra,
      }) as ResourceMeteringSessionRecord;
    const segments = (overrides: Record<string, jest.Mock>) =>
      new MeteringSegments(store(overrides), {} as never, {} as never, new Logger('test'));

    it('starts a new segment at the counter when a restored session finds none open', async () => {
      const createSegment = jest.fn();
      await segments({
        findSegmentedRunningSessionsOfUsage: jest.fn().mockResolvedValue([running(4)]),
        findMeterById: jest.fn().mockResolvedValue(meter({ counterValue: '7000000000' })),
        findOpenSegment: jest.fn().mockResolvedValue(null),
        createSegment,
      }).restore(undefined, 4);
      expect(createSegment).toHaveBeenCalledWith(
        expect.objectContaining({
          meterId: 1,
          status: 'open',
          startValue: '7000000000',
          participants: [{ usageId: 4, creditsPerUnit: 30 }],
        }),
        undefined,
      );
    });

    it('falls back to the session baseline, then to zero, for the start of a new segment', async () => {
      const createSegment = jest.fn();
      const restoreWith = (session: ResourceMeteringSessionRecord) =>
        segments({
          findSegmentedRunningSessionsOfUsage: jest.fn().mockResolvedValue([session]),
          findMeterById: jest.fn().mockResolvedValue(meter()),
          findOpenSegment: jest.fn().mockResolvedValue(null),
          createSegment,
        }).restore(undefined, 4);
      await restoreWith(running(4, { baselineValue: '5' }));
      await restoreWith(running(4));
      expect(createSegment.mock.calls.map(([segment]) => segment.startValue)).toEqual(['5', '0']);
    });

    it('adds a restored session to the open segment in start order, once', async () => {
      const open = {
        id: 'o',
        participants: [
          { usageId: 2, creditsPerUnit: 30 },
          { usageId: 9, creditsPerUnit: 30 },
        ],
      };
      const updateSegment = jest.fn();
      const restore = (usageId: number) =>
        segments({
          findSegmentedRunningSessionsOfUsage: jest.fn().mockResolvedValue([running(usageId)]),
          findMeterById: jest.fn().mockResolvedValue(meter()),
          findOpenSegment: jest.fn().mockResolvedValue(open),
          updateSegment,
        }).restore(undefined, usageId);
      await restore(4);
      await restore(9);
      expect(updateSegment).toHaveBeenCalledTimes(1);
      expect(updateSegment).toHaveBeenCalledWith(
        'o',
        { participants: [2, 4, 9].map((usageId) => ({ usageId, creditsPerUnit: 30 })) },
        undefined,
      );
    });

    it('fails to restore a session whose meter is gone', async () => {
      await expect(
        segments({
          findSegmentedRunningSessionsOfUsage: jest.fn().mockResolvedValue([running(4)]),
          findMeterById: jest.fn().mockResolvedValue(null),
        }).restore(undefined, 4),
      ).rejects.toThrow('The meter 1 does not exist');
    });

    it('withdraws a rolled-back start from the open segments it was added to', async () => {
      const updateSegment = jest.fn();
      await segments({
        findOpenSegments: jest.fn().mockResolvedValue([
          {
            id: 'with',
            participants: [
              { usageId: 4, creditsPerUnit: 1 },
              { usageId: 5, creditsPerUnit: 1 },
            ],
          },
          { id: 'without', participants: [{ usageId: 5, creditsPerUnit: 1 }] },
        ]),
        updateSegment,
      }).withdraw(undefined, 4, 1);
      expect(updateSegment).toHaveBeenCalledTimes(1);
      expect(updateSegment).toHaveBeenCalledWith(
        'with',
        { participants: [{ usageId: 5, creditsPerUnit: 1 }] },
        undefined,
      );
    });
  });
});
