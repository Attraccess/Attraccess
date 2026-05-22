/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceUsageEvent } from '../usage/events/resource-usage.events';
import { ResourceUsageAction, ResourceUsage, Resource, ResourceType } from '@attraccess/database-entities';
import { FlowExecutionError } from './errors/flow-execution.error';

describe('ResourceFlowsExecutorService – handleResourceUsageEvent', () => {
  let service: ResourceFlowsExecutorService;
  let triggerResourceUsageNodeSpy: jest.SpyInstance;

  const mockResource: Resource = {
    id: 1,
    name: 'Test Door',
    type: ResourceType.Door,
    metadata: null,
  } as Resource;

  const mockUser = {
    id: 1,
    username: 'testuser',
    externalIdentifier: 'ext-1',
  };

  function makeUsage(action: ResourceUsageAction): ResourceUsage {
    return {
      id: 100,
      resourceId: 1,
      userId: 1,
      usageAction: action,
      startTime: new Date('2025-01-01T00:00:00Z'),
      endTime: new Date('2025-01-01T00:00:01Z'),
      resource: mockResource,
      user: mockUser,
    } as unknown as ResourceUsage;
  }

  beforeEach(() => {
    service = Object.create(ResourceFlowsExecutorService.prototype);
    (service as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    (service as any).flowNodeRepository = { find: jest.fn().mockResolvedValue([]) };

    triggerResourceUsageNodeSpy = jest
      .spyOn(service as any, 'triggerResourceUsageNode')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should skip flow execution for Usage actions', async () => {
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.Usage));
    await service.handleResourceUsageEvent(event);
    expect(triggerResourceUsageNodeSpy).not.toHaveBeenCalled();
  });

  it('should trigger flow for DoorLock action', async () => {
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorLock));
    await service.handleResourceUsageEvent(event);
    expect(triggerResourceUsageNodeSpy).toHaveBeenCalledWith(
      1,
      'door.locked',
      expect.objectContaining({ resource: expect.objectContaining({ id: 1 }) }),
    );
  });

  it('should trigger flow for DoorUnlock action', async () => {
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorUnlock));
    await service.handleResourceUsageEvent(event);
    expect(triggerResourceUsageNodeSpy).toHaveBeenCalledWith(
      1,
      'door.unlocked',
      expect.objectContaining({ resource: expect.objectContaining({ id: 1 }) }),
    );
  });

  it('should trigger flow for DoorUnlatch action', async () => {
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorUnlatch));
    await service.handleResourceUsageEvent(event);
    expect(triggerResourceUsageNodeSpy).toHaveBeenCalledWith(
      1,
      'door.unlatched',
      expect.objectContaining({ resource: expect.objectContaining({ id: 1 }) }),
    );
  });

  it('should re-throw FlowExecutionError from DoorLock flow with correct type', async () => {
    triggerResourceUsageNodeSpy.mockRejectedValueOnce(new FlowExecutionError('Door access denied'));
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorLock));
    await expect(service.handleResourceUsageEvent(event)).rejects.toThrow(FlowExecutionError);
  });

  it('should re-throw FlowExecutionError from DoorLock flow with correct message', async () => {
    triggerResourceUsageNodeSpy.mockRejectedValueOnce(new FlowExecutionError('Door access denied'));
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorLock));
    await expect(service.handleResourceUsageEvent(event)).rejects.toThrow('FLOW_EXECUTION_ERROR: Door access denied');
  });

  it('should re-throw FlowExecutionError from DoorUnlock flow', async () => {
    triggerResourceUsageNodeSpy.mockRejectedValueOnce(new FlowExecutionError('Unlock forbidden'));
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorUnlock));
    await expect(service.handleResourceUsageEvent(event)).rejects.toThrow(FlowExecutionError);
  });

  it('should re-throw FlowExecutionError from DoorUnlatch flow', async () => {
    triggerResourceUsageNodeSpy.mockRejectedValueOnce(new FlowExecutionError('Unlatch error'));
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorUnlatch));
    await expect(service.handleResourceUsageEvent(event)).rejects.toThrow(FlowExecutionError);
  });

  it('should re-throw generic errors from door flow', async () => {
    triggerResourceUsageNodeSpy.mockRejectedValueOnce(new Error('Database unavailable'));
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorLock));
    await expect(service.handleResourceUsageEvent(event)).rejects.toThrow('Database unavailable');
  });

  it('should log error before re-throwing', async () => {
    const error = new FlowExecutionError('Custom error message');
    triggerResourceUsageNodeSpy.mockRejectedValueOnce(error);
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorLock));

    await expect(service.handleResourceUsageEvent(event)).rejects.toThrow();
    expect((service as any).logger.error).toHaveBeenCalledWith(
      'Failed to handle resource usage event',
      expect.any(String),
    );
  });

  it('should include event data in flow payload for DoorLock', async () => {
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorLock));
    await service.handleResourceUsageEvent(event);

    const payload = triggerResourceUsageNodeSpy.mock.calls[0][2];
    expect(payload).toMatchObject({
      event: { timestamp: expect.any(String) },
      usage: { start: expect.any(String), end: expect.any(String) },
      user: { id: 1, username: 'testuser', externalIdentifier: 'ext-1' },
      resource: { id: 1, name: 'Test Door', metadata: null },
    });
  });

  it('should include event data in flow payload for DoorUnlock', async () => {
    const event = new ResourceUsageEvent(makeUsage(ResourceUsageAction.DoorUnlock));
    await service.handleResourceUsageEvent(event);

    const payload = triggerResourceUsageNodeSpy.mock.calls[0][2];
    expect(payload).toMatchObject({
      event: { timestamp: expect.any(String) },
      usage: { start: expect.any(String), end: expect.any(String) },
      user: { id: 1, username: 'testuser', externalIdentifier: 'ext-1' },
      resource: { id: 1, name: 'Test Door', metadata: null },
    });
  });

  it('should use endTime as event timestamp when available', async () => {
    const usage = makeUsage(ResourceUsageAction.DoorLock);
    usage.endTime = new Date('2025-06-15T10:30:00Z');
    const event = new ResourceUsageEvent(usage);

    await service.handleResourceUsageEvent(event);
    const payload = triggerResourceUsageNodeSpy.mock.calls[0][2];
    expect(payload.event.timestamp).toBe('2025-06-15T10:30:00.000Z');
  });

  it('should use startTime as event timestamp when endTime is null', async () => {
    const usage = makeUsage(ResourceUsageAction.DoorUnlock);
    usage.endTime = null;
    usage.startTime = new Date('2025-06-15T09:00:00Z');
    const event = new ResourceUsageEvent(usage);

    await service.handleResourceUsageEvent(event);
    const payload = triggerResourceUsageNodeSpy.mock.calls[0][2];
    expect(payload.event.timestamp).toBe('2025-06-15T09:00:00.000Z');
  });
});
