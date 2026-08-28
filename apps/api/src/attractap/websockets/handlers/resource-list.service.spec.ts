/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceListService } from './resource-list.service';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { ResourceFlowNodeType, ResourceIntroducerType, SupervisionMode } from '@attraccess/database-entities';

describe('ResourceListService', () => {
  let service: ResourceListService;
  let websocketService: { sockets: Map<string, any> };
  let attractapService: { findReaderById: jest.Mock };
  let resourceUsageService: { getActiveSessions: jest.Mock; canControllResource: jest.Mock };
  let resourceMaintenanceService: { getActiveMaintenanceResourceIds: jest.Mock };
  let resourceHealthService: { listForResources: jest.Mock };
  let resourceFlowsService: { getNodesForResources: jest.Mock };
  let resourceIntroducersService: { getManyForResources: jest.Mock; isIntroducer: jest.Mock };
  let usersService: { findOne: jest.Mock };

  function createMockSocket(overrides: Partial<any> = {}): any {
    return {
      id: 'socket-1',
      readerId: 42,
      state: { lastAuthenticatedUserId: null },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
      ...overrides,
    };
  }

  function createReaderFixture(overrides: Partial<any> = {}): any {
    return {
      id: 42,
      name: 'Front Door Reader',
      ledBrightness: 128,
      resources: [
        {
          id: 10,
          name: '3D Printer',
          type: 'machine',
          separateUnlockAndUnlatch: true,
          description: 'A printer',
          allowTakeOver: false,
          introducers: [{ user: { username: 'introducer-a' } }],
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    service = Object.create(ResourceListService.prototype);

    (service as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    (service as any).pendingSends = new Map();

    websocketService = { sockets: new Map() };
    attractapService = { findReaderById: jest.fn() };
    resourceUsageService = {
      getActiveSessions: jest.fn().mockResolvedValue(new Map([[10, null]])),
      canControllResource: jest.fn().mockResolvedValue(false),
    };
    resourceMaintenanceService = { getActiveMaintenanceResourceIds: jest.fn().mockResolvedValue(new Set()) };
    resourceHealthService = { listForResources: jest.fn().mockResolvedValue(new Map([[10, []]])) };
    resourceFlowsService = { getNodesForResources: jest.fn().mockResolvedValue(new Map([[10, []]])) };
    resourceIntroducersService = {
      getManyForResources: jest.fn().mockResolvedValue(new Map([[10, [{ user: { username: 'introducer-a' } }]]])),
      isIntroducer: jest.fn().mockResolvedValue(false),
    };
    usersService = { findOne: jest.fn().mockResolvedValue(null) };

    (service as any).websocketService = websocketService;
    (service as any).attractapService = attractapService;
    (service as any).resourceUsageService = resourceUsageService;
    (service as any).resourceMaintenanceService = resourceMaintenanceService;
    (service as any).resourceHealthService = resourceHealthService;
    (service as any).resourceFlowsService = resourceFlowsService;
    (service as any).resourceIntroducersService = resourceIntroducersService;
    (service as any).usersService = usersService;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sendResourceList', () => {
    it('resolves without calling findReaderById when no sockets match the reader id', async () => {
      websocketService.sockets.set('a', createMockSocket({ id: 'a', readerId: 1 }));
      websocketService.sockets.set('b', createMockSocket({ id: 'b', readerId: 2 }));

      const spy = jest.spyOn(service, 'sendResourceListToSocket').mockResolvedValue(undefined);

      await expect(service.sendResourceList(999)).resolves.toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(attractapService.findReaderById).not.toHaveBeenCalled();
    });

    it('builds one resource list and sends it to each matching socket', async () => {
      const matchA = createMockSocket({ id: 'a', readerId: 42 });
      const matchB = createMockSocket({ id: 'b', readerId: 42 });
      const other = createMockSocket({ id: 'c', readerId: 7 });
      websocketService.sockets.set('a', matchA);
      websocketService.sockets.set('b', matchB);
      websocketService.sockets.set('c', other);

      attractapService.findReaderById.mockResolvedValue(createReaderFixture());

      await service.sendResourceList(42);

      expect(attractapService.findReaderById).toHaveBeenCalledTimes(1);
      expect(resourceIntroducersService.getManyForResources).toHaveBeenCalledTimes(1);
      expect(matchA.sendMessage).toHaveBeenCalledTimes(1);
      expect(matchB.sendMessage).toHaveBeenCalledTimes(1);
      expect(other.sendMessage).not.toHaveBeenCalled();
      expect(matchA.sendMessage.mock.calls[0][0]).not.toBe(matchB.sendMessage.mock.calls[0][0]);
      expect(matchA.sendMessage.mock.calls[0][0].data.payload).toEqual(matchB.sendMessage.mock.calls[0][0].data.payload);
    });
  });

  describe('sendResourceListToReadersWithResources', () => {
    it('builds one resource list per reader when several sockets match', async () => {
      const s1 = createMockSocket({ id: 's1', readerId: 42 });
      const s2 = createMockSocket({ id: 's2', readerId: 42 });
      websocketService.sockets.set('s1', s1);
      websocketService.sockets.set('s2', s2);
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());

      service.sendResourceListToReadersWithResources([10]);
      await jest.runAllTimersAsync();

      expect(attractapService.findReaderById).toHaveBeenCalledTimes(1);
      expect(resourceIntroducersService.getManyForResources).toHaveBeenCalledTimes(1);
      expect(s1.sendMessage).toHaveBeenCalledTimes(1);
      expect(s2.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('refreshes a reader when any of several resources match', async () => {
      const s1 = createMockSocket({ id: 's1', readerId: 42 });
      websocketService.sockets.set('s1', s1);
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());

      service.sendResourceListToReadersWithResources([10, 20]);
      await jest.runAllTimersAsync();

      expect(s1.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does not refresh readers when no resources are affected', async () => {
      const s1 = createMockSocket({ id: 's1', readerId: 42 });
      websocketService.sockets.set('s1', s1);
      const spy = jest.spyOn(service, 'sendResourceList').mockResolvedValue(undefined);

      service.sendResourceListToReadersWithResources([]);

      expect(spy).not.toHaveBeenCalled();
    });

    it('coalesces rapid events and filters by every affected resource', async () => {
      const socket = createMockSocket({ readerId: 42 });
      websocketService.sockets.set('socket', socket);
      const spy = jest.spyOn(service, 'sendResourceList').mockResolvedValue(undefined);

      service.sendResourceListToReadersWithResources([10]);
      service.sendResourceListToReadersWithResources([11, 12]);
      await jest.runAllTimersAsync();

      expect(spy).toHaveBeenCalledWith(42, new Set([10, 11, 12]));
    });

    it('sends at the first debounce deadline while events continue arriving', async () => {
      const socket = createMockSocket({ readerId: 42 });
      websocketService.sockets.set('socket', socket);
      const spy = jest.spyOn(service, 'sendResourceList').mockResolvedValue(undefined);

      service.sendResourceListToReadersWithResources([10]);
      await jest.advanceTimersByTimeAsync(100);
      service.sendResourceListToReadersWithResources([11]);
      await jest.advanceTimersByTimeAsync(100);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(42, new Set([10, 11]));
    });
  });

  describe('sendResourceListToSocket', () => {
    it('throws "Reader not found" when the reader does not exist', async () => {
      attractapService.findReaderById.mockResolvedValue(null);
      const socket = createMockSocket({ readerId: 42 });

      await expect(service.sendResourceListToSocket(socket)).rejects.toThrow('Reader not found: 42');

      expect(attractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns without sending when onlyIfResourceMatches.resourceIds do not include a reader resource', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket, { resourceIds: new Set([999]) });

      expect(socket.sendMessage).not.toHaveBeenCalled();
      expect(resourceUsageService.getActiveSessions).not.toHaveBeenCalled();
    });

    it('sends the resource list when onlyIfResourceMatches.resourceIds include a reader resource', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket, { resourceIds: new Set([10]) });

      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('builds the full RESOURCE_LIST payload on the happy path', async () => {
      const startTime = new Date('2026-06-04T10:00:00.000Z');
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceUsageService.getActiveSessions.mockResolvedValue(new Map([[10, { user: { username: 'active-user' }, startTime }]]));
      resourceMaintenanceService.getActiveMaintenanceResourceIds.mockResolvedValue(new Set([10]));
      resourceFlowsService.getNodesForResources.mockResolvedValue(new Map([[10, [{ id: 'node-1', data: { label: 'Start' } }]]]));

      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket);

      expect(attractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(resourceUsageService.getActiveSessions).toHaveBeenCalledWith([10]);
      expect(resourceMaintenanceService.getActiveMaintenanceResourceIds).toHaveBeenCalledWith([10]);
      expect(resourceFlowsService.getNodesForResources).toHaveBeenCalledWith([10], ResourceFlowNodeType.INPUT_BUTTON);
      expect(resourceIntroducersService.getManyForResources).toHaveBeenCalledWith(
        [10],
        ResourceIntroducerType.INTRODUCER,
      );

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_LIST,
            payload: {
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
                  hasIntroduction: false,
                  isIntroducer: false,
                  requiresSupervisor: false,
                  activeUsageSession: {
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

    it('includes selected-resource authorization for an authenticated card', async () => {
      attractapService.findReaderById.mockResolvedValue(
        createReaderFixture({
          resources: [
            { ...createReaderFixture().resources[0], id: 10, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
            { ...createReaderFixture().resources[0], id: 11, supervisionMode: SupervisionMode.SUPERVISION_ALLOWED },
          ],
        }),
      );
      usersService.findOne.mockResolvedValue({ id: 7 });
      resourceUsageService.canControllResource.mockImplementation((resourceId) => Promise.resolve(resourceId === 10));
      resourceIntroducersService.isIntroducer.mockImplementation((resourceId) => Promise.resolve(resourceId === 11));
      const socket = createMockSocket({ state: { lastAuthenticatedUserId: 7 } });

      await service.sendResourceListToSocket(socket);

      expect(resourceUsageService.canControllResource).toHaveBeenCalledWith(10, { id: 7 });
      expect(resourceUsageService.canControllResource).toHaveBeenCalledWith(11, { id: 7 });
      expect((socket.sendMessage as jest.Mock).mock.calls[0][0].data.payload.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 10, hasIntroduction: true, isIntroducer: false, requiresSupervisor: false }),
          expect.objectContaining({ id: 11, hasIntroduction: false, isIntroducer: true, requiresSupervisor: true }),
        ]),
      );
    });

    it('includes introducers inherited from resource groups', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceIntroducersService.getManyForResources.mockResolvedValue(
        new Map([[10, [{ user: { username: 'direct-introducer' } }, { user: { username: 'group-introducer' } }]]]),
      );

      const socket = createMockSocket();
      await service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].introducers).toEqual(['direct-introducer', 'group-introducer']);
    });

    it('omits deleted introducers from the resource list', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceIntroducersService.getManyForResources.mockResolvedValue(
        new Map([[10, [{ user: null }, { user: { username: 'introducer' } }]]]),
      );

      const socket = createMockSocket();
      await service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].introducers).toEqual(['introducer']);
    });

    it('reports isHealthy=false with a combined reason when there are unhealthy entries', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceHealthService.listForResources.mockResolvedValue(new Map([[10, [
        { identifier: 'temp', status: 'unhealthy', reason: 'overheating' },
        { identifier: '', status: 'unhealthy', reason: 'not connected' },
        { identifier: 'idle', status: 'healthy', reason: null },
      ]]]));

      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket);

      expect(resourceHealthService.listForResources).toHaveBeenCalledWith([10]);
      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      const resource = (sent.data.payload as any).resources[0];
      expect(resource.isHealthy).toBe(false);
      expect(resource.healthReason).toBe('temp: overheating\nnot connected');
    });

    it('reports isHealthy=true with an empty reason when all entries are healthy', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceHealthService.listForResources.mockResolvedValue(new Map([[10, [{ identifier: '', status: 'healthy', reason: null }]]]));

      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      const resource = (sent.data.payload as any).resources[0];
      expect(resource.isHealthy).toBe(true);
      expect(resource.healthReason).toBe('');
    });

    it('sends a per-instant UTC offset alongside the session start time so the reader renders local wall-clock time', async () => {
      // Two timestamps the same Europe/Berlin day are on opposite sides of nothing, but a winter
      // and a summer instant differ by the DST offset. Computing per-timestamp keeps both correct.
      const summer = new Date('2026-07-01T10:00:00.000Z');
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceUsageService.getActiveSessions.mockResolvedValue(new Map([[10, { user: { username: 'active-user' }, startTime: summer }]]));

      const socket = createMockSocket();
      await service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      const session = (sent.data.payload as any).resources[0].activeUsageSession;
      // Offset is the inverse of getTimezoneOffset() for that exact instant (DST-correct).
      expect(session.startTimeUtcOffsetMinutes).toBe(-summer.getTimezoneOffset());
    });

    it('emits activeUsageSession=null when there is no active session', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceUsageService.getActiveSessions.mockResolvedValue(new Map([[10, null]]));

      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].activeUsageSession).toBeNull();
    });

    it('falls back to node.id for the flowButton label when data.label is empty', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceFlowsService.getNodesForResources.mockResolvedValue(new Map([[10, [{ id: 'fallback-id', data: { label: '' } }]]]));

      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket);

      const sent = (socket.sendMessage as jest.Mock).mock.calls[0][0] as AttractapEvent;
      expect((sent.data.payload as any).resources[0].flowButtons).toEqual([
        { id: 'fallback-id', label: 'fallback-id' },
      ]);
    });

    it('logs a debug message before sending', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      const socket = createMockSocket({ id: 'sock-debug' });

      await service.sendResourceListToSocket(socket);

      expect((service as any).logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Sending resource list to socket sock-debug'),
        expect.any(AttractapEvent),
      );
    });

    it('proceeds to send when onlyIfResourceMatches is provided without a resourceId', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket, {});

      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
