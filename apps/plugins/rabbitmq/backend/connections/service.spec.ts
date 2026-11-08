import { HttpException } from '@nestjs/common';
import { RabbitmqConnectionsService } from './service';

describe('RabbitmqConnectionsService', () => {
  const config = { id: 4, username: 'monitor' };
  const getMqttServerConfig = jest.fn();
  const request = jest.fn();
  const service = new RabbitmqConnectionsService({ getMqttServerConfig } as never, { request } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    getMqttServerConfig.mockResolvedValue(config);
  });

  it('maps connections defensively and sorts by client id', async () => {
    request.mockResolvedValue([
      {
        name: '10.0.0.2:5000 -> 10.0.0.1:1883',
        user: 'dev',
        peer_host: '10.0.0.2',
        peer_port: 5000,
        protocol: 'MQTT 3.1.1',
        state: 'running',
        connected_at: 1700000000000,
        channels: 1,
        recv_oct: 10,
        send_oct: 20,
        recv_oct_details: { rate: 1.5 },
        client_properties: { client_id: 'zeta' },
        ssl: true,
      },
      // Old broker: nothing but a name.
      { name: 'bare' },
      { not: 'a connection' },
    ]);
    const result = await service.listConnections(4);
    expect(request).toHaveBeenCalledWith(config, 'GET', '/connections');
    expect(result.total).toBe(2);
    expect(result.connections.map((c) => c.name)).toEqual(['bare', '10.0.0.2:5000 -> 10.0.0.1:1883']);
    expect(result.connections[1]).toMatchObject({
      clientId: 'zeta',
      peerHost: '10.0.0.2',
      peerPort: 5000,
      protocol: 'MQTT 3.1.1',
      recvRate: 1.5,
      sendRate: null,
      ssl: true,
    });
    expect(result.connections[0]).toMatchObject({ user: null, channels: null, ssl: false });
  });

  it('tolerates a non-array response', async () => {
    request.mockResolvedValue(null);
    await expect(service.listConnections(4)).resolves.toMatchObject({ total: 0, connections: [] });
  });

  it('answers 404 for an unknown server', async () => {
    getMqttServerConfig.mockResolvedValue(null);
    await expect(service.listConnections(9)).rejects.toMatchObject({ status: 404 });
    await expect(service.closeConnection(9, 'x')).rejects.toBeInstanceOf(HttpException);
    expect(request).not.toHaveBeenCalled();
  });

  it('encodes the name and sends a sanitised X-Reason when closing', async () => {
    request.mockResolvedValue(null);
    await service.closeConnection(4, '10.0.0.2:5000 -> 10.0.0.1:1883', 'maintenance\r\nX-Evil: 1 ü');
    expect(request).toHaveBeenCalledWith(
      config,
      'DELETE',
      `/connections/${encodeURIComponent('10.0.0.2:5000 -> 10.0.0.1:1883')}`,
      undefined,
      { 'x-reason': 'maintenance??X-Evil: 1 ?' },
    );
  });

  it('omits X-Reason without a reason and rejects an empty name', async () => {
    request.mockResolvedValue(null);
    await service.closeConnection(4, 'c');
    expect(request).toHaveBeenCalledWith(config, 'DELETE', '/connections/c', undefined, {});
    await expect(service.closeConnection(4, '')).rejects.toMatchObject({ status: 400 });
  });
});
