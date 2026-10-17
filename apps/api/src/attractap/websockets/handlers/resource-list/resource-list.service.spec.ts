/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerResourceListServiceFixture } from './service.test-fixture';
import { SupervisionMode, ResourceFlowNodeType, ResourceIntroducerType } from '@attraccess/database-entities';
import { AttractapEvent, AttractapEventType } from '../../websocket.types';

describe('ResourceListService', () => {
  const fixture = registerResourceListServiceFixture();

  describe('sendResourceList', () => {
    it('resolves without calling findReaderById when no sockets match the reader id', async () => {
      fixture.websocketService.sockets.set('a', fixture.createMockSocket({ id: 'a', readerId: 1 }));
      fixture.websocketService.sockets.set('b', fixture.createMockSocket({ id: 'b', readerId: 2 }));

      const spy = jest.spyOn(fixture.service, 'sendResourceListToSocket').mockResolvedValue(undefined);

      await expect(fixture.service.sendResourceList(999)).resolves.toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(fixture.attractapService.findReaderById).not.toHaveBeenCalled();
    });

    it('builds one resource list and sends it to each matching socket', async () => {
      const matchA = fixture.createMockSocket({ id: 'a', readerId: 42 });
      const matchB = fixture.createMockSocket({ id: 'b', readerId: 42 });
      const other = fixture.createMockSocket({ id: 'c', readerId: 7 });
      fixture.websocketService.sockets.set('a', matchA);
      fixture.websocketService.sockets.set('b', matchB);
      fixture.websocketService.sockets.set('c', other);

      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());

      await fixture.service.sendResourceList(42);

      expect(fixture.attractapService.findReaderById).toHaveBeenCalledTimes(1);
      expect(fixture.resourceIntroducersService.getManyForResources).toHaveBeenCalledTimes(1);
      expect(matchA.sendMessage).toHaveBeenCalledTimes(1);
      expect(matchB.sendMessage).toHaveBeenCalledTimes(1);
      expect(other.sendMessage).not.toHaveBeenCalled();
      expect(matchA.sendMessage.mock.calls[0][0]).not.toBe(matchB.sendMessage.mock.calls[0][0]);
      expect(matchA.sendMessage.mock.calls[0][0].data.payload).toBe(matchB.sendMessage.mock.calls[0][0].data.payload);
    });
  });

  describe('per-resource card access', () => {
    it('keeps users isolated while sharing list queries and same-user permission results', async () => {
      const a = fixture.createMockSocket({ id: 'a', state: { lastAuthenticatedUserId: 1 } });
      const b = fixture.createMockSocket({ id: 'b', state: { lastAuthenticatedUserId: 2 } });
      const c = fixture.createMockSocket({ id: 'c', state: { lastAuthenticatedUserId: 1 } });
      const guest = fixture.createMockSocket({ id: 'guest' });
      for (const socket of [a, b, c, guest]) fixture.websocketService.sockets.set(socket.id, socket);
      fixture.attractapService.findReaderById.mockResolvedValue(
        fixture.createReaderFixture({
          resources: [
            { id: 10, name: 'Laser', supervisionMode: SupervisionMode.SUPERVISION_ALLOWED },
            { id: 20, name: 'Printer', supervisionMode: SupervisionMode.SUPERVISION_REQUIRED },
          ],
        }),
      );
      fixture.resourceUsageService.canControllResource.mockImplementation(
        async (resourceId, user) => resourceId === 10 && user.id === 1,
      );
      fixture.resourceMaintenanceService.getMaintenanceManagedResourceIds.mockImplementation(async (user) =>
        user.id === 2 ? new Set([20]) : new Set(),
      );
      await fixture.service.sendResourceList(42);
      const payload = (socket: any) => socket.sendMessage.mock.calls[0][0].data.payload;
      expect(payload(a).authenticatedUsername).toBe('user-1');
      expect(payload(b).authenticatedUsername).toBe('user-2');
      expect(payload(c)).toBe(payload(a));
      expect(payload(a).resources[0]).toMatchObject({ hasIntroduction: true, requiresSupervisor: false });
      expect(payload(b).resources[0]).toMatchObject({ hasIntroduction: false, requiresSupervisor: true });
      expect(payload(a).resources[1]).toMatchObject({
        hasIntroduction: false,
        requiresSupervisor: true,
        canManageMaintenance: false,
      });
      expect(payload(b).resources[1]).toMatchObject({ canManageMaintenance: true });
      expect(payload(guest).resources[0]).not.toHaveProperty('hasIntroduction');
      expect(fixture.resourceUsageService.canControllResource).toHaveBeenCalledTimes(4);
      expect(fixture.resourceUsageService.getActiveSessions).toHaveBeenCalledTimes(1);
      expect(fixture.resourceMaintenanceService.getMaintenanceManagedResourceIds).toHaveBeenCalledTimes(2);
      expect(fixture.resourceMaintenanceService.getMaintenanceManagedResourceIds).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        [10, 20],
        expect.any(Set),
      );
    });

    it('discards personalized results if another card arrives during authorization', async () => {
      const socket = fixture.createMockSocket({ state: { lastAuthenticatedUserId: 1 } });
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceUsageService.canControllResource.mockImplementation(async () => {
        socket.state.lastAuthenticatedUserId = 2;
        return true;
      });
      await fixture.service.sendResourceListToSocket(socket);
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('correlates explicit refreshes and versions snapshots before asynchronous work', async () => {
      const socket = fixture.createMockSocket({ state: { lastAuthenticatedUserId: 1 } });
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      let release: () => void;
      const held = new Promise<boolean>((resolve) => {
        release = () => resolve(false);
      });
      fixture.resourceUsageService.canControllResource.mockReturnValueOnce(held).mockResolvedValue(true);
      const oldBroadcast = fixture.service.sendResourceListToSocket(socket);
      // Advance through reader/user/permission awaits to the held authorization.
      while (!fixture.resourceUsageService.canControllResource.mock.calls.length) await Promise.resolve();
      await fixture.service.sendResourceListToSocket(socket, { requestId: 880 });
      release();
      await oldBroadcast;
      const [fresh, old] = socket.sendMessage.mock.calls.map(([event]) => event.data.payload);
      expect(fresh).toMatchObject({ requestId: 880, revision: 2 });
      expect(old.revision).toBe(1);
      expect(old).not.toHaveProperty('requestId');
    });

    it('fails closed for a deleted user', async () => {
      const socket = fixture.createMockSocket({ state: { lastAuthenticatedUserId: 1 } });
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      (fixture.service as any).usersService.findOne.mockResolvedValue(null);
      await fixture.service.sendResourceListToSocket(socket);
      const payload = socket.sendMessage.mock.calls[0][0].data.payload;
      expect(payload.authenticatedUsername).toBe('');
      expect(payload.resources[0]).not.toHaveProperty('hasIntroduction');
    });
  });

  describe('sendResourceListToReadersWithResources', () => {
    it('builds one resource list per reader when several sockets match', async () => {
      const s1 = fixture.createMockSocket({ id: 's1', readerId: 42 });
      const s2 = fixture.createMockSocket({ id: 's2', readerId: 42 });
      fixture.websocketService.sockets.set('s1', s1);
      fixture.websocketService.sockets.set('s2', s2);
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());

      fixture.service.sendResourceListToReadersWithResources([10]);
      await jest.runAllTimersAsync();

      expect(fixture.attractapService.findReaderById).toHaveBeenCalledTimes(1);
      expect(fixture.resourceIntroducersService.getManyForResources).toHaveBeenCalledTimes(1);
      expect(s1.sendMessage).toHaveBeenCalledTimes(1);
      expect(s2.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('refreshes a reader when any of several resources match', async () => {
      const s1 = fixture.createMockSocket({ id: 's1', readerId: 42 });
      fixture.websocketService.sockets.set('s1', s1);
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());

      fixture.service.sendResourceListToReadersWithResources([10, 20]);
      await jest.runAllTimersAsync();

      expect(s1.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does not refresh readers when no resources are affected', async () => {
      const s1 = fixture.createMockSocket({ id: 's1', readerId: 42 });
      fixture.websocketService.sockets.set('s1', s1);
      const spy = jest.spyOn(fixture.service, 'sendResourceList').mockResolvedValue(undefined);

      fixture.service.sendResourceListToReadersWithResources([]);

      expect(spy).not.toHaveBeenCalled();
    });

    it('coalesces rapid events and filters by every affected resource', async () => {
      const socket = fixture.createMockSocket({ readerId: 42 });
      fixture.websocketService.sockets.set('socket', socket);
      const spy = jest.spyOn(fixture.service, 'sendResourceList').mockResolvedValue(undefined);

      fixture.service.sendResourceListToReadersWithResources([10]);
      fixture.service.sendResourceListToReadersWithResources([11, 12]);
      await jest.runAllTimersAsync();

      expect(spy).toHaveBeenCalledWith(42, new Set([10, 11, 12]));
    });

    it('sends at the first debounce deadline while events continue arriving', async () => {
      const socket = fixture.createMockSocket({ readerId: 42 });
      fixture.websocketService.sockets.set('socket', socket);
      const spy = jest.spyOn(fixture.service, 'sendResourceList').mockResolvedValue(undefined);

      fixture.service.sendResourceListToReadersWithResources([10]);
      await jest.advanceTimersByTimeAsync(100);
      fixture.service.sendResourceListToReadersWithResources([11]);
      await jest.advanceTimersByTimeAsync(100);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(42, new Set([10, 11]));
    });
  });

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
});
