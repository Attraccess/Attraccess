import { createHash } from 'node:crypto';
import { ShellyHttpClient } from './shelly-http.client';
import { ShellyProbeService } from './shelly-probe.service';

describe('Shelly HTTP authentication', () => {
  let fetchMock: jest.SpyInstance;
  const client = new ShellyHttpClient();
  const url = 'http://192.0.2.1/rpc/Switch.Set?id=0';
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  it('sends no credentials until challenged and preserves the JSON body on retry', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="device"' } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(
      client.postJson(url, { on: true }, { currentPassword: 'secret', username: ' operator ' }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    expect(fetchMock.mock.calls[1]).toEqual([
      url,
      expect.objectContaining({
        method: 'POST',
        body: '{"on":true}',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from('operator:secret').toString('base64')}`,
        },
      }),
    ]);
  });
  it.each(['SHA-256', 'MD5'])(
    'answers a %s digest challenge for the exact requested method and URI',
    async (algorithm) => {
      fetchMock
        .mockResolvedValueOnce(
          new Response('', {
            status: 401,
            headers: {
              'WWW-Authenticate': `Digest realm="shelly", nonce="server-nonce", qop="auth,auth-int", algorithm=${algorithm}, opaque="opaque-value"`,
            },
          }),
        )
        .mockResolvedValueOnce(Response.json({ id: 0 }));
      await client.getJson(url, { currentPassword: 'secret' });
      const authorization = fetchMock.mock.calls[1][1].headers.Authorization as string;
      const cnonce = /cnonce="([a-f0-9]+)"/.exec(authorization)?.[1];
      expect(cnonce).toMatch(/^[a-f0-9]{16}$/);
      const hash = (value: string) => createHash(algorithm.toLowerCase().replace('-', '')).update(value).digest('hex');
      const expected = hash(
        `${hash('admin:shelly:secret')}:server-nonce:00000001:${cnonce}:auth:${hash('GET:/rpc/Switch.Set?id=0')}`,
      );
      expect(authorization).toContain(`response="${expected}"`);
      expect(authorization).toContain('opaque="opaque-value"');
      expect(authorization).toContain('qop=auth, nc=00000001');
    },
  );
  it('supports legacy digest without qop and falls back for incomplete challenges', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Digest realm="shelly", nonce="nonce"' } }),
      )
      .mockResolvedValueOnce(Response.json({}));
    await client.getJson(url, { currentPassword: 'secret' });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).not.toContain('qop=');
    fetchMock
      .mockClear()
      .mockResolvedValueOnce(
        new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Digest realm="shelly"' } }),
      )
      .mockResolvedValueOnce(Response.json({}));
    await client.getJson(url, { currentPassword: 'secret' });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      `Basic ${Buffer.from('admin:secret').toString('base64')}`,
    );
  });
  it('does not retry unauthenticated failures without a password', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(client.getJson(url, {})).rejects.toThrow('HTTP 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Shelly generation probing', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    [
      { type: 'SHSW-25', auth: true },
      { generation: 1, model: 'SHSW-25', authState: 'required' },
    ],
    [{ auth: false }, { generation: 1, model: null, authState: 'none' }],
    [
      { gen: 2, model: 'SNSW', auth_en: true },
      { generation: 2, model: 'SNSW', authState: 'required' },
    ],
    [
      { gen: 3, auth_en: false },
      { generation: 3, model: null, authState: 'none' },
    ],
  ])('interprets %p', async (raw, expected) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(raw));
    await expect(new ShellyProbeService().probe('192.0.2.1')).resolves.toEqual({ ...expected, raw });
  });
});
