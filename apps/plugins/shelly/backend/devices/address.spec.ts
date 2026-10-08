import { ShellyHttpClient } from '../communication/http-client';
import { ShellyProbeService } from './probe.service';
import { ShellyController } from './controller';

describe('Shelly device request boundaries', () => {
  const client = new ShellyHttpClient();
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ gen: 2 }));
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    '169.254.169.254',
    '169.254.170.2',
    '169.254.170.23',
    '168.63.129.16',
    '100.100.100.200',
    '127.0.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '0xa9fea9fe',
    '2852039166',
    'idp.example',
    '192.168.1.1@169.254.169.254',
    '192.168.1.1/path',
    '192.168.1.1?url=x',
    '192.168.1.1:8080',
  ])('rejects unsafe probe addresses without outbound requests: %s', async (address) => {
    await expect(new ShellyProbeService().probe(address)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['192.168.1.10', '10.1.2.3', '172.16.0.10', '169.254.1.10'])(
    'preserves private and ordinary link-local devices: %s',
    async (address) => {
      await expect(new ShellyProbeService().probe(address)).resolves.toMatchObject({ generation: 2 });
      expect(fetchMock).toHaveBeenCalledWith(
        `http://${address}/shelly`,
        expect.objectContaining({ redirect: 'error' }),
      );
    },
  );

  it.each([
    'http://169.254.169.254/rpc/Shelly.SetAuth',
    'http://0xa9fea9fe/status',
    'http://[::ffff:169.254.169.254]/status',
    'http://device.local/status',
    'http://127.0.0.1/status',
    'https://192.168.1.1/status',
    'http://192.168.1.1:8080/status',
    'http://user:password@192.168.1.1/status',
  ])('rejects unsafe saved-device URLs before disclosing credentials: %s', async (url) => {
    await expect(client.getJson(url, { currentPassword: 'secret' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables redirects on probes and on both credential challenge requests', async () => {
    await new ShellyProbeService().probe('192.168.1.1');
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="shelly"' } }))
      .mockResolvedValueOnce(Response.json({}));
    await client.getJson('http://192.168.1.1/status', { currentPassword: 'secret' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchMock.mock.calls) expect(options.redirect).toBe('error');
  });

  it('does not persist an invalid or non-string device address when probing is best effort', async () => {
    const registry = { findByIp: jest.fn(), create: jest.fn() };
    const controller = new ShellyController(registry as never, {} as never, {} as never, {} as never, {} as never);
    for (const ipAddress of ['169.254.169.254', 'host.local', []]) {
      await expect(controller.add({ ipAddress: ipAddress as never })).rejects.toThrow();
    }
    expect(registry.findByIp).not.toHaveBeenCalled();
    expect(registry.create).not.toHaveBeenCalled();
  });
});
