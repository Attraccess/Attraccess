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
    expect(request).toHaveBeenCalledWith(config, 'GET', expect.stringMatching(/^\/connections\?columns=/));
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

  it('asks for exactly the columns the mapper reads', async () => {
    const full = {
      name: 'c',
      user: 'u',
      vhost: '/',
      peer_host: 'h',
      peer_port: 1,
      protocol: 'MQTT 5-0',
      state: 'running',
      ssl: true,
      connected_at: 2,
      channels: 3,
      recv_oct: 4,
      send_oct: 5,
      recv_oct_details: { rate: 6 },
      send_oct_details: { rate: 7 },
      client_properties: { connection_name: 'cid' },
      // Not read by the mapper, so not requested.
      garbage_collection: { min_heap_size: 1 },
      reductions_details: { rate: 1 },
    };
    request.mockResolvedValue([full]);
    const fromFull = (await service.listConnections(4)).connections[0];
    const path: string = request.mock.calls[0][2];
    const columns = new URLSearchParams(path.split('?')[1]).get('columns')?.split(',') ?? [];
    request.mockResolvedValue([
      Object.fromEntries(columns.map((column) => [column, full[column as keyof typeof full]])),
    ]);
    expect((await service.listConnections(4)).connections[0]).toEqual(fromFull);
    expect(Object.values(fromFull).every((value) => value !== null)).toBe(true);
    expect(columns).not.toContain('garbage_collection');
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
      { 'x-reason': 'maintenance??X-Evil: 1 u' },
    );
  });

  it('keeps accented reasons readable and replaces what has no ASCII form', async () => {
    request.mockResolvedValue(null);
    await service.closeConnection(4, 'c', 'Gerät défekt – 日本');
    expect(request).toHaveBeenCalledWith(config, 'DELETE', '/connections/c', undefined, {
      'x-reason': 'Gerat defekt ? ??',
    });
  });

  it('ignores a repeated (array) reason instead of failing', async () => {
    request.mockResolvedValue(null);
    await service.closeConnection(4, 'c', ['a', 'b']);
    expect(request).toHaveBeenCalledWith(config, 'DELETE', '/connections/c', undefined, {});
  });

  it.each(['.', '..', ['a', 'b']])('rejects the connection name %j', async (name) => {
    await expect(service.closeConnection(4, name)).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
  });

  it('omits X-Reason without a reason and rejects an empty name', async () => {
    request.mockResolvedValue(null);
    await service.closeConnection(4, 'c');
    expect(request).toHaveBeenCalledWith(config, 'DELETE', '/connections/c', undefined, {});
    await expect(service.closeConnection(4, '')).rejects.toMatchObject({ status: 400 });
  });
});
