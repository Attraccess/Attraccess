// Zigbee capability detection (ATT-789). `GET /shelly` carries no radio flags,
// so capability is inferred from whether the device answers `Zigbee.GetConfig`.
//
// The 404 case is not guesswork: a real Shelly Pro 1 (Gen2, fw 1.3.3) answers
// `{"code":404,"message":"No handler for Zigbee.GetConfig"}`.
import { ShellyProbeService } from './shelly-probe.service';

const GEN2_INFO = { id: 'shellypro1-ec62608d1254', model: 'SPSW-201XE16EU', gen: 2, auth_en: false };
const GEN1_INFO = { type: 'SHSW-25', auth: false };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Routes fetch by URL suffix so each test only states what it cares about. */
function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = Object.keys(routes).find((suffix) => url.endsWith(suffix));
    if (!route) throw new Error(`unexpected request to ${url}`);
    return routes[route]();
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('ShellyProbeService Zigbee detection', () => {
  const service = new ShellyProbeService();
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reports a Gen4 that answers Zigbee.GetConfig as capable, with its radio state', async () => {
    stubFetch({
      '/shelly': () => jsonResponse({ ...GEN2_INFO, gen: 4, model: 'S4SW-001P16EU' }),
      '/rpc/Zigbee.GetConfig': () => jsonResponse({ enable: true }),
      '/rpc/Zigbee.GetStatus': () => jsonResponse({ network_state: 'joined' }),
    });

    const result = await service.probe('192.168.1.40');

    expect(result.generation).toBe(4);
    expect(result.zigbee).toEqual({ capable: true, enabled: true, networkState: 'joined' });
  });

  it('treats a 404 "no handler" as a definitive not-Zigbee-capable', async () => {
    stubFetch({
      '/shelly': () => jsonResponse(GEN2_INFO),
      '/rpc/Zigbee.GetConfig': () => jsonResponse({ code: 404, message: 'No handler for Zigbee.GetConfig' }, 404),
    });

    const result = await service.probe('192.168.1.41');

    expect(result.zigbee).toEqual({ capable: false, enabled: false, networkState: null });
  });

  it('leaves capability unknown when the RPC call fails for any other reason', async () => {
    stubFetch({
      '/shelly': () => jsonResponse(GEN2_INFO),
      '/rpc/Zigbee.GetConfig': () => jsonResponse({}, 401),
    });

    // Null, not false: a 401 or a timeout must not downgrade a device we may
    // already know to be Zigbee-capable.
    await expect(service.probe('192.168.1.42')).resolves.toMatchObject({ zigbee: null });
  });

  it('leaves capability unknown when the RPC call throws', async () => {
    stubFetch({
      '/shelly': () => jsonResponse(GEN2_INFO),
      '/rpc/Zigbee.GetConfig': () => {
        throw new Error('socket hang up');
      },
    });

    await expect(service.probe('192.168.1.43')).resolves.toMatchObject({ zigbee: null });
  });

  it('still reports the device as capable when only the status call fails', async () => {
    stubFetch({
      '/shelly': () => jsonResponse({ ...GEN2_INFO, gen: 4 }),
      '/rpc/Zigbee.GetConfig': () => jsonResponse({ enable: false }),
      '/rpc/Zigbee.GetStatus': () => jsonResponse({}, 500),
    });

    const result = await service.probe('192.168.1.44');

    expect(result.zigbee).toEqual({ capable: true, enabled: false, networkState: null });
  });

  it('does not ask a Gen1 device about Zigbee at all', async () => {
    const fetchMock = stubFetch({ '/shelly': () => jsonResponse(GEN1_INFO) });

    const result = await service.probe('192.168.1.45');

    expect(result.generation).toBe(1);
    expect(result.zigbee).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
