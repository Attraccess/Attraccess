import { FEATURE_FAMILIES } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCACertificates } from 'node:tls';
import { selfSignedCertificate } from '../testing/certs';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar.test-utils';
import {
  SidecarAbortedError,
  SidecarIncompatibleError,
  SidecarMisconfiguredError,
  SidecarRequestError,
  SidecarTimeoutError,
  SidecarUnauthorizedError,
  SidecarUnavailableError,
} from './errors';
import { SidecarHttpClient, trustedAuthorities } from './rest-client';

const identity = { attraccessVersion: HOST_VERSION, pluginVersion: entry.plugin, sidecarVersion: entry.sidecar };
const CORRELATION_ID = '11111111-1111-4111-8111-111111111111';
const fabric = { body: { label: 'Makerspace' } };

describe('SidecarHttpClient', () => {
  let fake: FakeSidecar;
  afterEach(() => fake?.stop());
  const client = (overrides: Partial<ConstructorParameters<typeof SidecarHttpClient>[0]> = {}, timeout?: number) =>
    new SidecarHttpClient({ url: fake.url, token: TOKEN, ...overrides }, identity, timeout);

  it('sends the wire version, the three releases, a correlation ID, the deadline and the bearer token', async () => {
    fake = await FakeSidecar.start();
    const report = await client().capabilities({
      correlationId: '11111111-1111-4111-8111-111111111111',
      timeoutMs: 1500,
    });
    expect(report.capabilities).toHaveLength(FEATURE_FAMILIES.length);
    expect(fake.requests[0].headers).toMatchObject({
      'x-matter-wire-version': '1',
      'x-attraccess-version': HOST_VERSION,
      'x-matter-plugin-version': entry.plugin,
      'x-matter-sidecar-version': entry.sidecar,
      'x-correlation-id': '11111111-1111-4111-8111-111111111111',
      'x-request-deadline-ms': '1500',
      authorization: `Bearer ${TOKEN}`,
    });
  });

  it('keeps a reverse-proxy path prefix: https://host/prefix leads to /prefix/v1/...', async () => {
    fake = await FakeSidecar.start({ prefix: '/matter-proxy' });
    await client().capabilities();
    expect(fake.requests[0].path).toBe('/v1/capabilities');
    expect((await client({ url: `${fake.url}/` }).version()).sidecar).toBe(entry.sidecar);
  });

  it('answers a missing credential with a typed unauthorized error', async () => {
    fake = await FakeSidecar.start({ tokens: ['another-token-0123456789abcdef0123456789'] });
    await expect(client().version()).rejects.toBeInstanceOf(SidecarUnauthorizedError);
  });

  it('answers a release mismatch with an incompatible error that carries the sidecar details', async () => {
    fake = await FakeSidecar.start({ sidecarVersion: '9.9.9' });
    const failure = await client()
      .capabilities()
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarIncompatibleError);
    expect(failure.details).toMatchObject({ running: { sidecar: '9.9.9' } });
  });

  it('maps a refused connection and a proxy 502 to unavailable', async () => {
    fake = await FakeSidecar.start();
    const url = fake.url;
    await fake.stop();
    await expect(new SidecarHttpClient({ url, token: TOKEN }, identity).version()).rejects.toBeInstanceOf(
      SidecarUnavailableError,
    );
    fake = await FakeSidecar.start();
    fake.restOverride = (_req, res) => {
      res.writeHead(502);
      res.end('<html>Bad gateway with secret</html>');
    };
    const failure = await client()
      .version()
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarUnavailableError);
    expect(failure.message).not.toContain('secret');
  });

  it('times out with a typed error and never retries', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = () => undefined; // never answers
    const started = Date.now();
    await expect(client({}, 100).version()).rejects.toBeInstanceOf(SidecarTimeoutError);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(fake.requests).toHaveLength(1);
  });

  it('honours caller cancellation and client shutdown', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = () => undefined;
    const controller = new AbortController();
    const pending = client().capabilities({ signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toBeInstanceOf(SidecarAbortedError);
    const closing = client();
    const inFlight = closing.version();
    setTimeout(() => closing.close(), 50);
    await expect(inFlight).rejects.toBeInstanceOf(SidecarAbortedError);
    await expect(client().capabilities({ signal: AbortSignal.abort() })).rejects.toBeInstanceOf(SidecarAbortedError);
  });

  it('rejects a response that violates the contract', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"capabilities":[]}');
    };
    await expect(client().capabilities()).rejects.toBeInstanceOf(SidecarRequestError);
    fake.restOverride = (_req, res) => void res.end('not json');
    await expect(client().capabilities()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('reports contract error codes with retryable and outcome from the envelope', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = (_req, res) => {
      res.writeHead(504, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'timeout',
            message: 'The request timed out.',
            correlationId: '11111111-1111-4111-8111-111111111111',
            retryable: false,
            outcome: 'uncertain',
          },
        }),
      );
    };
    const failure = await client()
      .version()
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarTimeoutError);
    expect(failure).toMatchObject({
      outcome: 'uncertain',
      retryable: false,
      correlationId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('validates path parameters and bodies before sending anything', async () => {
    fake = await FakeSidecar.start();
    await expect(client().call('inventory.get', { params: { nodeId: 'not-a-node' } })).rejects.toBeInstanceOf(
      SidecarRequestError,
    );
    // @ts-expect-error the body is typed from the contract, so this does not even compile
    await expect(client().call('fabric.create', { body: { bogus: true } })).rejects.toBeInstanceOf(SidecarRequestError);
    expect(fake.requests).toHaveLength(0);
  });

  it('reports a physical operation that timed out as uncertain, and sends it exactly once', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = () => undefined; // never answers
    const failure = await client({}, 100)
      .call('fabric.create', { ...fabric, correlationId: CORRELATION_ID })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarTimeoutError);
    expect(failure).toMatchObject({ outcome: 'uncertain', retryable: false, correlationId: CORRELATION_ID });
    expect(fake.requests).toHaveLength(1);
  });

  it('reports a physical operation whose connection reset after it was sent as uncertain', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = (req) => void req.socket.destroy();
    const failure = await client()
      .call('fabric.create', { ...fabric, correlationId: CORRELATION_ID })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarUnavailableError);
    expect(failure).toMatchObject({ outcome: 'uncertain', retryable: false, correlationId: CORRELATION_ID });
    expect(fake.requests).toHaveLength(1);
    // The same failure on a read is an ordinary, retryable network error.
    const read = await client()
      .call('fabric.get')
      .catch((error) => error);
    expect(read).toMatchObject({ kind: 'unavailable', retryable: true, outcome: undefined });
  });

  it('reports a physical operation cancelled after it was sent as uncertain', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = () => undefined;
    const controller = new AbortController();
    const pending = client().call('fabric.create', { ...fabric, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toMatchObject({ kind: 'aborted', outcome: 'uncertain', retryable: false });
  });

  it('reports a proxy gateway error on a physical operation as uncertain, but not on a read', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = (_req, res) =>
      void res.writeHead(502, { 'content-type': 'text/html' }).end('<h1>Bad Gateway</h1>');
    const failure = await client()
      .call('fabric.create', fabric)
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarUnavailableError);
    expect(failure).toMatchObject({ status: 502, outcome: 'uncertain', retryable: false });
    const read = await client()
      .call('fabric.get')
      .catch((error) => error);
    expect(read).toMatchObject({ status: 502, retryable: true, outcome: undefined });
  });

  it('keeps a physical operation that never reached the sidecar retryable, with its correlation ID', async () => {
    fake = await FakeSidecar.start();
    const url = fake.url;
    await fake.stop();
    const failure = await new SidecarHttpClient({ url, token: TOKEN }, identity)
      .call('fabric.create', { ...fabric, correlationId: CORRELATION_ID })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarUnavailableError);
    expect(failure).toMatchObject({ retryable: true, outcome: undefined, correlationId: CORRELATION_ID });
  });

  it('answers an unsupported wire version (426) with an incompatible error that carries the details', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = (_req, res) => {
      res.writeHead(426, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'unsupported_wire_version',
            message: 'Missing, malformed or unsupported wire version. Supported wire version: 1.',
            correlationId: CORRELATION_ID,
            retryable: false,
            details: { supportedWireVersion: 1 },
          },
        }),
      );
    };
    const failure = await client()
      .capabilities()
      .catch((error) => error);
    expect(failure).toBeInstanceOf(SidecarIncompatibleError);
    expect(failure).toMatchObject({ status: 426, details: { supportedWireVersion: 1 }, correlationId: CORRELATION_ID });
  });

  it('never puts the token into an error message', async () => {
    fake = await FakeSidecar.start({ tokens: ['another-token-0123456789abcdef0123456789'] });
    const failure = await client()
      .version()
      .catch((error) => error);
    expect(JSON.stringify({ message: failure.message, stack: failure.stack?.split('\n')[0] })).not.toContain(TOKEN);
  });
});

describe('SidecarHttpClient over TLS', () => {
  let fake: FakeSidecar;
  afterEach(() => fake?.stop());

  it('connects with an administrator-supplied CA', async () => {
    const certificate = await selfSignedCertificate();
    fake = await FakeSidecar.start({ tls: certificate });
    const client = new SidecarHttpClient({ url: fake.url, token: TOKEN, caCertificate: certificate.cert }, identity);
    expect((await client.version()).sidecar).toBe(entry.sidecar);
  });

  it('reports an untrusted certificate as misconfigured', async () => {
    fake = await FakeSidecar.start({ tls: await selfSignedCertificate() });
    const failure = await new SidecarHttpClient({ url: fake.url, token: TOKEN }, identity).version().catch((e) => e);
    expect(failure).toBeInstanceOf(SidecarMisconfiguredError);
    expect(failure.code).toBe('tls');
  });

  it('trusts the default store (with NODE_EXTRA_CA_CERTS) plus the CA, built once per client', async () => {
    const { cert } = await selfSignedCertificate();
    expect(trustedAuthorities(cert)).toEqual([...getCACertificates('default'), cert]);
    expect(trustedAuthorities(null)).toEqual([]);
    const client = new SidecarHttpClient({ url: 'https://127.0.0.1:1', token: TOKEN, caCertificate: cert }, identity);
    expect(client.tlsOptions.secureContext).toBeDefined();
    expect(client.tlsOptions.secureContext).toBe(client.tlsOptions.secureContext);
    expect(new SidecarHttpClient({ url: 'https://127.0.0.1:1', token: TOKEN }, identity).tlsOptions).toEqual({});
  });

  it('has no way to skip certificate verification', () => {
    const sources = ['rest-client.ts', 'event-stream.ts'].map((file) => readFileSync(join(__dirname, file), 'utf8'));
    for (const source of sources) expect(source).not.toMatch(/rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/);
  });
});
