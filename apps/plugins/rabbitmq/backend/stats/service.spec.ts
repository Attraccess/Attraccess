import { RabbitmqStatsService } from './service';

describe('RabbitmqStatsService', () => {
  const config = { id: 1 };
  const getMqttServerConfig = jest.fn();
  const request = jest.fn();
  const service = new RabbitmqStatsService({ getMqttServerConfig } as never, { request } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    getMqttServerConfig.mockResolvedValue(config);
  });

  it('maps overview, nodes and queues', async () => {
    request.mockImplementation(async (_c, _m, path: string) => {
      if (path === '/overview')
        return {
          rabbitmq_version: '3.13.0',
          erlang_version: '26.2',
          cluster_name: 'rabbit@host',
          object_totals: { connections: 2, channels: 1, queues: 3, consumers: 4 },
          queue_totals: { messages_ready: 5, messages_unacknowledged: 6 },
          message_stats: { publish_details: { rate: 1.2 }, deliver_get_details: { rate: 3.4 } },
        };
      if (path === '/nodes')
        return [
          { name: 'b', running: true, mem_used: 1, mem_limit: 2, mem_alarm: false, uptime: 1000 },
          { name: 'a', disk_free_alarm: true },
        ];
      return [
        { vhost: '/', name: 'z', type: 'classic', messages_ready: 1 },
        { vhost: '/', name: 'a', state: 'running', consumers: 2 },
      ];
    });
    const stats = await service.getStats(1);
    expect(stats.overview).toMatchObject({
      rabbitmqVersion: '3.13.0',
      connections: 2,
      messagesReady: 5,
      publishRate: 1.2,
      deliverRate: 3.4,
    });
    expect(stats.nodes.map((n) => n.name)).toEqual(['a', 'b']);
    expect(stats.nodes[0]).toMatchObject({ diskFreeAlarm: true, running: null, memUsed: null });
    expect(stats.queues.map((q) => q.name)).toEqual(['a', 'z']);
    expect(stats.totalQueues).toBe(2);
  });

  it('survives an empty / old-version overview', async () => {
    request.mockResolvedValue({});
    const stats = await service.getStats(1);
    expect(stats.overview.rabbitmqVersion).toBeNull();
    expect(stats.overview.publishRate).toBeNull();
    expect(stats.nodes).toEqual([]);
    expect(stats.queues).toEqual([]);
  });

  it('answers 404 for an unknown server', async () => {
    getMqttServerConfig.mockResolvedValue(null);
    await expect(service.getStats(2)).rejects.toMatchObject({ status: 404 });
  });
});
