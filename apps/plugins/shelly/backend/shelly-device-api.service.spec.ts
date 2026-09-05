import { ShellyDeviceApiService } from './shelly-device-api.service';
import { ShellyHttpClient } from './shelly-http.client';

describe('ShellyDeviceApiService', () => {
  const fetchMock = jest.fn();
  let service: ShellyDeviceApiService;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    service = new ShellyDeviceApiService(new ShellyHttpClient());
  });

  it('reads status and config from Gen1 devices', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ relay: [{ ison: true }] }))
      .mockResolvedValueOnce(jsonResponse({ name: 'Workshop relay' }));

    const result = await service.getDeviceInfo({ ipAddress: '192.168.1.10', generation: 1 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://192.168.1.10/status',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.1.10/settings',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(result).toMatchObject({ generation: 1, status: { relay: [{ ison: true }] }, config: { name: 'Workshop relay' } });
  });

  it('reads status and config from Gen2+ devices', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ 'switch:0': { output: true } }))
      .mockResolvedValueOnce(jsonResponse({ sys: { device: { name: 'Workshop relay' } } }));

    const result = await service.getDeviceInfo({ ipAddress: '192.168.1.11', generation: 2 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://192.168.1.11/rpc/Shelly.GetStatus',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.1.11/rpc/Shelly.GetConfig',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(result).toMatchObject({ generation: 2, status: { 'switch:0': { output: true } }, config: { sys: { device: { name: 'Workshop relay' } } } });
  });

  it('sets Gen1 admin auth through settings login', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ enabled: true }));

    await service.setAdminPassword({ ipAddress: '192.168.1.12', generation: 1, username: 'admin', password: 'new secret' });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestedUrl.href).toBe('http://192.168.1.12/settings/login?enabled=1&username=admin&password=new+secret');
  });

  it('sets Gen2+ admin auth through Shelly.SetAuth', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'shellyplus1pm-aabbcc' }))
      .mockResolvedValueOnce(jsonResponse({ restart_required: true }));

    await service.setAdminPassword({ ipAddress: '192.168.1.13', generation: 2, username: 'admin', password: 'new secret' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://192.168.1.13/shelly', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.1.13/rpc/Shelly.SetAuth',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          user: 'admin',
          realm: 'shellyplus1pm-aabbcc',
          ha1: 'f18bfc7a82bc27bd078d10b0a1da0a1d',
        }),
      })
    );
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
