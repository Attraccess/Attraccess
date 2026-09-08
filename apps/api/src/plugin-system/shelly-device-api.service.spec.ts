import { createHash } from 'crypto';
// eslint-disable-next-line @nx/enforce-module-boundaries -- test covers host behavior against plugin device API integration.
import { ShellyDeviceApiService } from '../../../plugins/shelly/backend/shelly-device-api.service';
// eslint-disable-next-line @nx/enforce-module-boundaries -- test covers host behavior against plugin device API integration.
import { ShellyHttpClient } from '../../../plugins/shelly/backend/shelly-http.client';

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
          ha1: createHash('sha256').update('admin:shellyplus1pm-aabbcc:new secret').digest('hex'),
        }),
      })
    );
  });

  it('forces the Gen2+ user to admin because the device supports no other user', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'shellyplus1pm-aabbcc' }))
      .mockResolvedValueOnce(jsonResponse({ restart_required: true }));

    await service.setAdminPassword({ ipAddress: '192.168.1.13', generation: 2, username: 'operator', password: 'new secret' });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      user: 'admin',
      realm: 'shellyplus1pm-aabbcc',
      ha1: createHash('sha256').update('admin:shellyplus1pm-aabbcc:new secret').digest('hex'),
    });
  });

  it('includes the device error body when a request fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '{"code":-103,"message":"Argument \'ha1\' is invalid"}',
    } as Response);

    await expect(
      service.setAdminPassword({ ipAddress: '192.168.1.13', generation: 2, password: 'new secret' })
    ).rejects.toThrow("Argument 'ha1' is invalid");
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
