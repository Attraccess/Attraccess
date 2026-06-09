import { Logger } from '@nestjs/common';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceHealthSource,
  ResourceHealthStatus,
} from '@attraccess/database-entities';
import { ResourceHealthService } from '../../health/resource-health.service';
import { HealthHeartbeatExecutor } from './health-heartbeat.executor';
import { heartbeatKey } from './flow.utils';

function createNode(partial: Partial<ResourceFlowNode>): ResourceFlowNode {
  return {
    id: 'n1',
    type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
    resourceId: 1,
    data: {},
    ...partial,
  } as unknown as ResourceFlowNode;
}

describe('HealthHeartbeatExecutor', () => {
  let executor: HealthHeartbeatExecutor;
  let resourceHealthService: { reportHealth: jest.Mock };
  let heartbeatLastSeen: Map<string, Date>;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    resourceHealthService = { reportHealth: jest.fn().mockResolvedValue(undefined) };
    heartbeatLastSeen = new Map<string, Date>();
    executor = new HealthHeartbeatExecutor(
      resourceHealthService as unknown as ResourceHealthService,
      heartbeatLastSeen,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('invalid node data (schema safeParse failure)', () => {
    it('warns and returns the input untouched without reporting health', async () => {
      // timeoutSeconds is required (positive int); omitting it fails the schema.
      const node = createNode({ data: { identifier: 'Shelly' } });
      const input = { foo: 'bar' };

      const result = await executor.execute(node, input);

      expect(result).toEqual({ payload: input });
      expect(result.payload).toBe(input);
      expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
      expect(heartbeatLastSeen.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('Heartbeat node n1 has invalid data');
    });

    it('fails the schema when timeoutSeconds is not a positive int', async () => {
      const node = createNode({ data: { timeoutSeconds: -5 } });

      const result = await executor.execute(node, { a: 1 });

      expect(result).toEqual({ payload: { a: 1 } });
      expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
      expect(heartbeatLastSeen.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('valid node data (success path)', () => {
    it('stamps the last-seen map and reports HEALTHY with the trimmed identifier', async () => {
      const node = createNode({
        resourceId: 42,
        data: { identifier: '  Shelly  ', timeoutSeconds: 30 },
      });
      const input = { payload: 'in' };

      const before = Date.now();
      const result = await executor.execute(node, input);
      const after = Date.now();

      expect(result).toEqual({ payload: input });
      expect(result.payload).toBe(input);

      // Map stamped at heartbeatKey(resourceId, trimmedIdentifier)
      const key = heartbeatKey(42, 'Shelly');
      expect(heartbeatLastSeen.has(key)).toBe(true);
      const stamped = heartbeatLastSeen.get(key) as Date;
      expect(stamped).toBeInstanceOf(Date);
      expect(stamped.getTime()).toBeGreaterThanOrEqual(before);
      expect(stamped.getTime()).toBeLessThanOrEqual(after);

      // reportHealth called with the same timestamp instance and normalized identifier
      expect(resourceHealthService.reportHealth).toHaveBeenCalledTimes(1);
      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
        resourceId: 42,
        identifier: 'Shelly',
        status: ResourceHealthStatus.HEALTHY,
        reason: null,
        source: ResourceHealthSource.HEARTBEAT,
        reportedAt: stamped,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('defaults identifier to empty string when omitted', async () => {
      const node = createNode({ resourceId: 7, data: { timeoutSeconds: 10 } });

      await executor.execute(node, {});

      const key = heartbeatKey(7, '');
      expect(heartbeatLastSeen.has(key)).toBe(true);
      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 7, identifier: '' }),
      );
    });

    it('treats a whitespace-only identifier as empty', async () => {
      const node = createNode({ resourceId: 3, data: { identifier: '   ', timeoutSeconds: 5 } });

      await executor.execute(node, {});

      expect(heartbeatLastSeen.has(heartbeatKey(3, ''))).toBe(true);
      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: '' }),
      );
    });

    it('handles node.data being null/undefined by falling back to {} (then schema fails on missing timeoutSeconds)', async () => {
      const node = createNode({ data: undefined as unknown as Record<string, unknown> });

      const result = await executor.execute(node, { x: 1 });

      // {} fails schema (timeoutSeconds required) -> warn, no report
      expect(result).toEqual({ payload: { x: 1 } });
      expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('uses the same Date instance for the map stamp and reportHealth reportedAt', async () => {
      const node = createNode({ resourceId: 1, data: { identifier: 'x', timeoutSeconds: 1 } });

      await executor.execute(node, {});

      const stamped = heartbeatLastSeen.get(heartbeatKey(1, 'x')) as Date;
      const reportedAt = resourceHealthService.reportHealth.mock.calls[0][0].reportedAt;
      expect(reportedAt).toBe(stamped);
    });
  });
});
