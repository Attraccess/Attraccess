/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceListService } from './resource-list.service';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { ResourceFlowNodeType } from '@attraccess/database-entities';

describe('ResourceListService', () => {
  let service: ResourceListService;
  let websocketService: { sockets: Map<string, any> };
  let attractapService: { findReaderById: jest.Mock };
  let resourceUsageService: { getActiveSessions: jest.Mock };
  let resourceMaintenanceService: { getActiveMaintenanceResourceIds: jest.Mock };
  let resourceHealthService: { listForResources: jest.Mock };
  let resourceFlowsService: { getNodesForResources: jest.Mock };

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
    resourceUsageService = { getActiveSessions: jest.fn().mockResolvedValue(new Map([[10, null]])) };
    resourceMaintenanceService = { getActiveMaintenanceResourceIds: jest.fn().mockResolvedValue(new Set()) };
    resourceHealthService = { listForResources: jest.fn().mockResolvedValue(new Map([[10, []]])) };
    resourceFlowsService = { getNodesForResources: jest.fn().mockResolvedValue(new Map([[10, []]])) };

    (service as any).websocketService = websocketService;
    (service as any).attractapService = attractapService;
    (service as any).resourceUsageService = resourceUsageService;
    (service as any).resourceMaintenanceService = resourceMaintenanceService;
    (service as any).resourceHealthService = resourceHealthService;
    (service as any).resourceFlowsService = resourceFlowsService;
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

    it('calls sendResourceListToSocket for each matching socket', async () => {
      const matchA = createMockSocket({ id: 'a', readerId: 42 });
      const matchB = createMockSocket({ id: 'b', readerId: 42 });
      const other = createMockSocket({ id: 'c', readerId: 7 });
      websocketService.sockets.set('a', matchA);
      websocketService.sockets.set('b', matchB);
      websocketService.sockets.set('c', other);

      const spy = jest.spyOn(service, 'sendResourceListToSocket').mockResolvedValue(undefined);

      await service.sendResourceList(42);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(matchA);
      expect(spy).toHaveBeenCalledWith(matchB);
      expect(spy).not.toHaveBeenCalledWith(other);
    });
  });

  describe('sendResourceListToReadersWithResource', () => {
    it('schedules a debounced sendResourceList for each unique readerId', () => {
      const s1 = createMockSocket({ id: 's1', readerId: 42 });
      const s2 = createMockSocket({ id: 's2', readerId: 7 });
      // Two sockets for the same reader should only produce one send
      const s3 = createMockSocket({ id: 's3', readerId: 42 });
      websocketService.sockets.set('s1', s1);
      websocketService.sockets.set('s2', s2);
      websocketService.sockets.set('s3', s3);

      const spy = jest.spyOn(service, 'sendResourceList').mockResolvedValue(undefined);

      service.sendResourceListToReadersWithResource(10);

      // Nothing fired yet — debounce window still open
      expect(spy).not.toHaveBeenCalled();

      jest.runAllTimers();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(42);
      expect(spy).toHaveBeenCalledWith(7);
    });

    it('coalesces rapid successive calls into a single send per reader', () => {
      const s1 = createMockSocket({ id: 's1', readerId: 42 });
      websocketService.sockets.set('s1', s1);

      const spy = jest.spyOn(service, 'sendResourceList').mockResolvedValue(undefined);

      service.sendResourceListToReadersWithResource(10);
      service.sendResourceListToReadersWithResource(11);
      service.sendResourceListToReadersWithResource(12);

      jest.runAllTimers();

      // Three calls but the debounce collapses them into one send
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(42);
    });

    it('does nothing when there are no sockets', () => {
      const spy = jest.spyOn(service, 'sendResourceList').mockResolvedValue(undefined);

      service.sendResourceListToReadersWithResource(10);
      jest.runAllTimers();

      expect(spy).not.toHaveBeenCalled();
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

    it('returns without sending when onlyIfResourceMatches.resourceId is not among reader.resources', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket, { resourceId: 999 });

      expect(socket.sendMessage).not.toHaveBeenCalled();
      expect(resourceUsageService.getActiveSessions).not.toHaveBeenCalled();
    });

    it('sends the resource list when onlyIfResourceMatches.resourceId matches a reader resource', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket, { resourceId: 10 });

      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('builds the full RESOURCE_LIST payload on the happy path using bulk queries', async () => {
      const startTime = new Date('2026-06-04T10:00:00.000Z');
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceUsageService.getActiveSessions.mockResolvedValue(
        new Map([[10, { user: { username: 'active-user' }, startTime }]]),
      );
      resourceMaintenanceService.getActiveMaintenanceResourceIds.mockResolvedValue(new Set([10]));
      resourceFlowsService.getNodesForResources.mockResolvedValue(
        new Map([[10, [{ id: 'node-1', data: { label: 'Start' } }]]]),
      );

      const socket = createMockSocket();

      await service.sendResourceListToSocket(socket);

      expect(attractapService.findReaderById).toHaveBeenCalledWith(42);
      // Bulk methods called with the resource id array
      expect(resourceUsageService.getActiveSessions).toHaveBeenCalledWith([10]);
      expect(resourceMaintenanceService.getActiveMaintenanceResourceIds).toHaveBeenCalledWith([10]);
      expect(resourceFlowsService.getNodesForResources).toHaveBeenCalledWith([10], ResourceFlowNodeType.INPUT_BUTTON);

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

    it('issues exactly 4 bulk DB queries regardless of resource count', async () => {
      const reader = createReaderFixture({
        resources: [
          { id: 10, name: 'A', type: 'machine', separateUnlockAndUnlatch: false, description: '', allowTakeOver: false, introducers: [] },
          { id: 11, name: 'B', type: 'machine', separateUnlockAndUnlatch: false, description: '', allowTakeOver: false, introducers: [] },
          { id: 12, name: 'C', type: 'machine', separateUnlockAndUnlatch: false, description: '', allowTakeOver: false, introducers: [] },
        ],
      });
      attractapService.findReaderById.mockResolvedValue(reader);
      resourceHealthService.listForResources.mockResolvedValue(new Map([[10, []], [11, []], [12, []]]));
      resourceUsageService.getActiveSessions.mockResolvedValue(new Map([[10, null], [11, null], [12, null]]));
      resourceMaintenanceService.getActiveMaintenanceResourceIds.mockResolvedValue(new Set());
      resourceFlowsService.getNodesForResources.mockResolvedValue(new Map([[10, []], [11, []], [12, []]]));

      const socket = createMockSocket();
      await service.sendResourceListToSocket(socket);

      expect(resourceHealthService.listForResources).toHaveBeenCalledTimes(1);
      expect(resourceUsageService.getActiveSessions).toHaveBeenCalledTimes(1);
      expect(resourceMaintenanceService.getActiveMaintenanceResourceIds).toHaveBeenCalledTimes(1);
      expect(resourceFlowsService.getNodesForResources).toHaveBeenCalledTimes(1);
    });

    it('reports isHealthy=false with a combined reason when there are unhealthy entries', async () => {
      attractapService.findReaderById.mockResolvedValue(createReaderFixture());
      resourceHealthService.listForResources.mockResolvedValue(
        new Map([
          [10, [
            { identifier: 'temp', status: 'unhealthy', reason: 'overheating' },
            { identifier: '', status: 'unhealthy', reason: 'not connected' },
            { identifier: 'idle', status: 'healthy', reason: null },
          ]],
        ]),
      );

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
      resourceHealthService.listForResources.mockResolvedValue(
        new Map([[10, [{ identifier: '', status: 'healthy', reason: null }]]]),
      );

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
      resourceUsageService.getActiveSessions.mockResolvedValue(
        new Map([[10, { user: { username: 'active-user' }, startTime: summer }]]),
      );

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
      resourceFlowsService.getNodesForResources.mockResolvedValue(
        new Map([[10, [{ id: 'fallback-id', data: { label: '' } }]]]),
      );

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
