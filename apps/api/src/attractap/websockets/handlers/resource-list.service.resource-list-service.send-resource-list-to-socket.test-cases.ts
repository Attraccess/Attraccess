/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { ResourceFlowNodeType, ResourceIntroducerType } from '@attraccess/database-entities';
import { registerResourceListServiceFixture } from './resource-list.service.resource-list-service.test-fixture';
export function registerSendResourceListToSocketCases(fixture: ReturnType<typeof registerResourceListServiceFixture>) {
  describe('sendResourceListToSocket', () => {
    it('throws "Reader not found" when the reader does not exist', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(null);
      const socket = fixture.createMockSocket({ readerId: 42 });

      await expect(fixture.service.sendResourceListToSocket(socket)).rejects.toThrow('Reader not found: 42');

      expect(fixture.attractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns without sending when onlyIfResourceMatches.resourceIds do not include a reader resource', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket, { resourceIds: new Set([999]) });

      expect(socket.sendMessage).not.toHaveBeenCalled();
      expect(fixture.resourceUsageService.getActiveSessions).not.toHaveBeenCalled();
    });

    it('sends the resource list when onlyIfResourceMatches.resourceIds include a reader resource', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket, { resourceIds: new Set([10]) });

      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('builds the full RESOURCE_LIST payload on the happy path', async () => {
      const startTime = new Date('2026-06-04T10:00:00.000Z');
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceUsageService.getActiveSessions.mockResolvedValue(
        new Map([[10, { id: 99, user: { username: 'active-user' }, startTime }]]),
      );
      fixture.resourceMaintenanceService.getActiveMaintenanceResourceIds.mockResolvedValue(new Set([10]));
      fixture.resourceFlowsService.getNodesForResources.mockResolvedValue(
        new Map([[10, [{ id: 'node-1', data: { label: 'Start' } }]]]),
      );

      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket);

      expect(fixture.attractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(fixture.resourceUsageService.getActiveSessions).toHaveBeenCalledWith([10]);
      expect(fixture.resourceMaintenanceService.getActiveMaintenanceResourceIds).toHaveBeenCalledWith([10]);
      expect(fixture.resourceFlowsService.getNodesForResources).toHaveBeenCalledWith(
        [10],
        ResourceFlowNodeType.INPUT_BUTTON,
      );
      expect(fixture.resourceIntroducersService.getManyForResources).toHaveBeenCalledWith(
        [10],
        ResourceIntroducerType.INTRODUCER,
      );

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_LIST,
            payload: {
              revision: 1,
              readerName: 'Front Door Reader',
              ledBrightness: 128,
              resources: [
                {
                  id: 10,
                  name: '3D Printer',
                  type: 'machine',
                  separateUnlockAndUnlatch: true,
                  description: 'A printer',
                  allowTakeOver: false,
                  introducers: ['introducer-a'],
                  isUnderMaintenance: true,
                  isHealthy: true,
                  healthReason: '',
                  activeUsageSession: {
                    id: 99,
                    user: { username: 'active-user' },
                    startTime: startTime.toISOString(),
                    startTimeUtcOffsetMinutes: -startTime.getTimezoneOffset(),
                  },
                  flowButtons: [{ id: 'node-1', label: 'Start' }],
                },
              ],
            },
          }),
        }),
      );
    });

    it('includes introducers inherited from resource groups', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceIntroducersService.getManyForResources.mockResolvedValue(
        new Map([[10, [{ user: { username: 'direct-introducer' } }, { user: { username: 'group-introducer' } }]]]),
      );

      const socket = fixture.createMockSocket();
      await fixture.service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].introducers).toEqual(['direct-introducer', 'group-introducer']);
    });

    it('omits deleted introducers from the resource list', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceIntroducersService.getManyForResources.mockResolvedValue(
        new Map([[10, [{ user: null }, { user: { username: 'introducer' } }]]]),
      );

      const socket = fixture.createMockSocket();
      await fixture.service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].introducers).toEqual(['introducer']);
    });

    it('reports isHealthy=false with a combined reason when there are unhealthy entries', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceHealthService.listForResources.mockResolvedValue(
        new Map([
          [
            10,
            [
              { identifier: 'temp', status: 'unhealthy', reason: 'overheating' },
              { identifier: '', status: 'unhealthy', reason: 'not connected' },
              { identifier: 'idle', status: 'healthy', reason: null },
            ],
          ],
        ]),
      );

      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket);

      expect(fixture.resourceHealthService.listForResources).toHaveBeenCalledWith([10]);
      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      const resource = (sent.data.payload as any).resources[0];
      expect(resource.isHealthy).toBe(false);
      expect(resource.healthReason).toBe('temp: overheating\nnot connected');
    });

    it('reports isHealthy=true with an empty reason when all entries are healthy', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceHealthService.listForResources.mockResolvedValue(
        new Map([[10, [{ identifier: '', status: 'healthy', reason: null }]]]),
      );

      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      const resource = (sent.data.payload as any).resources[0];
      expect(resource.isHealthy).toBe(true);
      expect(resource.healthReason).toBe('');
    });

    it('sends a per-instant UTC offset alongside the session start time so the reader renders local wall-clock time', async () => {
      // Two timestamps the same Europe/Berlin day are on opposite sides of nothing, but a winter
      // and a summer instant differ by the DST offset. Computing per-timestamp keeps both correct.
      const summer = new Date('2026-07-01T10:00:00.000Z');
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceUsageService.getActiveSessions.mockResolvedValue(
        new Map([[10, { user: { username: 'active-user' }, startTime: summer }]]),
      );

      const socket = fixture.createMockSocket();
      await fixture.service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      const session = (sent.data.payload as any).resources[0].activeUsageSession;
      // Offset is the inverse of getTimezoneOffset() for that exact instant (DST-correct).
      expect(session.startTimeUtcOffsetMinutes).toBe(-summer.getTimezoneOffset());
    });

    it('emits activeUsageSession=null when there is no active session', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceUsageService.getActiveSessions.mockResolvedValue(new Map([[10, null]]));

      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].activeUsageSession).toBeNull();
    });

    it('falls back to node.id for the flowButton label when data.label is empty', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceFlowsService.getNodesForResources.mockResolvedValue(
        new Map([[10, [{ id: 'fallback-id', data: { label: '' } }]]]),
      );

      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].flowButtons).toEqual([
        { id: 'fallback-id', label: 'fallback-id' },
      ]);
    });

    it('logs a debug message before sending', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      const socket = fixture.createMockSocket({ id: 'sock-debug' });

      await fixture.service.sendResourceListToSocket(socket);

      expect((fixture.service as any).logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Sending resource list to socket sock-debug'),
        expect.any(AttractapEvent),
      );
    });

    it('proceeds to send when onlyIfResourceMatches is provided without a resourceId', async () => {
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      const socket = fixture.createMockSocket();

      await fixture.service.sendResourceListToSocket(socket, {});

      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
}
