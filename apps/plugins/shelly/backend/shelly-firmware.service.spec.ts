import { ShellyFirmwareService } from './shelly-firmware.service';
import { ShellyHttpClient } from './shelly-http.client';

describe('ShellyFirmwareService (ATT-501)', () => {
  const fetchMock = jest.fn();
  let service: ShellyFirmwareService;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    service = new ShellyFirmwareService(new ShellyHttpClient());
  });

  it('reports an available Gen1 update from /ota', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'idle',
        has_update: true,
        old_version: '20221027-102237/v1.12.1',
        new_version: '20230913-114150/v1.14.0',
        beta_version: '20231107-165007/v1.14.1-rc1',
      })
    );

    const status = await service.getStatus({ ipAddress: '192.168.1.10', generation: 1 });

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.10/ota', expect.any(Object));
    expect(status).toMatchObject({
      generation: 1,
      currentVersion: '20221027-102237/v1.12.1',
      available: { stable: '20230913-114150/v1.14.0', beta: '20231107-165007/v1.14.1-rc1' },
      hasUpdate: true,
      state: 'idle',
    });
  });

  it('reports Gen1 devices without an update as up to date', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'idle', has_update: false, old_version: 'v1.14.0', new_version: 'v1.14.0', beta_version: 'v1.14.0' })
    );

    const status = await service.getStatus({ ipAddress: '192.168.1.10', generation: 1 });

    expect(status).toMatchObject({ hasUpdate: false, available: { stable: null, beta: null } });
  });

  it('surfaces the Gen1 OTA progress state while it installs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'updating', has_update: true, old_version: 'v1.12.1', new_version: 'v1.14.0' }));

    await expect(service.getStatus({ ipAddress: '192.168.1.10', generation: 1 })).resolves.toMatchObject({ state: 'updating' });
  });

  it('reads Gen2+ versions from GetDeviceInfo and CheckForUpdate', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ver: '1.4.4' }))
      .mockResolvedValueOnce(jsonResponse({ stable: { version: '1.5.1' }, beta: { version: '1.6.0-beta1' } }));

    const status = await service.getStatus({ ipAddress: '192.168.1.11', generation: 2 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://192.168.1.11/rpc/Shelly.GetDeviceInfo', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://192.168.1.11/rpc/Shelly.CheckForUpdate', expect.any(Object));
    expect(status).toMatchObject({
      generation: 2,
      currentVersion: '1.4.4',
      available: { stable: '1.5.1', beta: '1.6.0-beta1' },
      hasUpdate: true,
    });
  });

  it('treats an empty Gen2+ CheckForUpdate result as up to date', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ver: '1.5.1' })).mockResolvedValueOnce(jsonResponse({}));

    await expect(service.getStatus({ ipAddress: '192.168.1.11', generation: 2 })).resolves.toMatchObject({
      hasUpdate: false,
      available: { stable: null, beta: null },
    });
  });

  it('triggers the Gen1 OTA over /ota', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'updating' }));

    await service.startUpdate({ ipAddress: '192.168.1.10', generation: 1 }, 'stable');

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.10/ota?update=true', expect.objectContaining({ method: 'GET' }));
  });

  it('triggers the Gen1 beta OTA over /ota?beta', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'updating' }));

    await service.startUpdate({ ipAddress: '192.168.1.10', generation: 1 }, 'beta');

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.10/ota?beta=true', expect.any(Object));
  });

  it('triggers the Gen2+ OTA over Shelly.Update with the requested stage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await service.startUpdate({ ipAddress: '192.168.1.11', generation: 2 }, 'beta');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.11/rpc/Shelly.Update',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ stage: 'beta' }) })
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
