import { HibpClient } from './hibp.client';

describe('HibpClient', () => {
  const originalFetch = globalThis.fetch;
  let client: HibpClient;

  beforeEach(() => {
    client = new HibpClient();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('reports pwned when suffix found with positive count', async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '0000000000000000000000000000000000A:5\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:99\r\nFFFF:1',
    } as Response)) as unknown as typeof fetch;
    const result = await client.check('password');
    expect(result.pwned).toBe(true);
    expect(result.count).toBe(99);
    expect(result.available).toBe(true);
  });

  it('reports not pwned when suffix not present', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'ABCDEF:1\r\n012345:2',
    } as Response)) as unknown as typeof fetch;
    const result = await client.check('s3cret-strong-pass');
    expect(result.pwned).toBe(false);
    expect(result.available).toBe(true);
  });

  it('fails open with available=false on non-ok response', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    } as Response)) as unknown as typeof fetch;
    const result = await client.check('whatever');
    expect(result.pwned).toBe(false);
    expect(result.available).toBe(false);
  });

  it('fails open on fetch error', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await client.check('whatever');
    expect(result.pwned).toBe(false);
    expect(result.available).toBe(false);
  });

  it('uses k-anonymity (sends 5-char prefix only)', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => '' } as Response;
    }) as unknown as typeof fetch;
    await client.check('password');
    expect(capturedUrl).toMatch(/\/5BAA6$/);
  });
});
