import type { MqttServerConnectionConfig, PluginContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter } from 'node:events';
import { request, RequestOptions } from 'node:https';
import { rootCertificates } from 'node:tls';
import { RabbitmqManagementClient } from './rabbitmq-management-client';
import { RabbitmqDetectionService } from './rabbitmq-detection.service';
import { RabbitmqCredentialProvisioningProvider } from './rabbitmq-credential-provisioning.provider';

jest.mock('node:https', () => ({ request: jest.fn() }));

describe('RabbitMQ management TLS trust', () => {
  const pem = rootCertificates[0]; // Valid PEM fixture; no connections are opened.
  let config: MqttServerConnectionConfig;
  let fetchMock: jest.SpyInstance;
  let detection: RabbitmqDetectionService;
  let provider: RabbitmqCredentialProvisioningProvider;
  let status: number;
  let responseBody: string;
  let failureCode: string | undefined;
  let stalled: boolean;
  let requests: Array<EventEmitter & { end: jest.Mock; destroy: jest.Mock }>;
  const client = new RabbitmqManagementClient();
  const httpsMock = request as jest.Mock;

  beforeEach(() => {
    config = {
      id: 4,
      name: 'test',
      host: 'broker.invalid',
      port: 8883,
      useTls: true,
      username: 'admin',
      password: 'private-password',
      clientId: null,
      caCert: pem,
      tlsServername: 'management.invalid',
    };
    const context = { getMqttServerConfig: jest.fn(async () => config) } as unknown as PluginContext;
    detection = new RabbitmqDetectionService(context);
    provider = new RabbitmqCredentialProvisioningProvider(context);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected HTTP request'));
    status = 200;
    responseBody = JSON.stringify({ rabbitmq_version: '4.0', management_version: '4.0' });
    failureCode = undefined;
    stalled = false;
    requests = [];
    httpsMock.mockReset().mockImplementation((_url, _options, callback) => {
      const req = Object.assign(new EventEmitter(), {
        end: jest.fn(() =>
          queueMicrotask(() => {
            if (stalled) return;
            if (failureCode) {
              req.emit('error', Object.assign(new Error('upstream-secret'), { code: failureCode }));
            } else {
              const res = Object.assign(new EventEmitter(), { statusCode: status });
              callback(res);
              res.emit('data', Buffer.from(responseBody));
              res.emit('end');
            }
            req.emit('close');
          }),
        ),
        destroy: jest.fn((error) => {
          req.emit('error', error);
          req.emit('close');
        }),
      });
      requests.push(req);
      return req;
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it.each([undefined, null, 25671, 15672])(
    'uses the management port %s with identical verified trust for detection and provisioning',
    async (managementPort) => {
      config = { ...config, port: 28883, managementPort };
      expect((await detection.detect(4)).isRabbitMQ).toBe(true);
      const credential = await provider.provision({
        mqttServerId: 4,
        identity: 'device-a',
        username: 'device-a',
        vhost: '/',
        topicPolicy: { publish: ['devices/device-a/#'], subscribe: [] },
      });
      expect(credential.password).toEqual(expect.any(String));
      expect(httpsMock.mock.calls.length).toBeGreaterThan(4);
      for (const [url, options] of httpsMock.mock.calls as [string, RequestOptions][]) {
        expect(url.startsWith(`https://broker.invalid:${managementPort ?? 15671}/api/`)).toBe(true);
        expect(options).toMatchObject({
          ca: pem,
          servername: 'management.invalid',
          rejectUnauthorized: true,
          agent: false,
        });
        expect(options.checkServerIdentity).toBeUndefined();
        expect(options.headers).toMatchObject({
          authorization: `Basic ${Buffer.from('admin:private-password').toString('base64')}`,
        });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('keeps system trust and default hostname verification when optional settings are absent', async () => {
    config = { ...config, managementPort: 25671, caCert: undefined, tlsServername: undefined };
    await client.request(config, 'GET', '/overview');
    expect(httpsMock.mock.calls[0][1]).toMatchObject({ rejectUnauthorized: true });
    expect(httpsMock.mock.calls[0][1]).not.toHaveProperty('ca');
    expect(httpsMock.mock.calls[0][1]).not.toHaveProperty('servername');
  });

  it('treats blank optional trust settings from MQTT server forms as absent', async () => {
    config = { ...config, caCert: '', tlsServername: '' };
    await client.request(config, 'GET', '/overview');
    expect((await detection.detect(4)).isRabbitMQ).toBe(true);
    for (const [, options] of httpsMock.mock.calls as [string, RequestOptions][]) {
      expect(options).toMatchObject({ rejectUnauthorized: true });
      expect(options).not.toHaveProperty('ca');
      expect(options).not.toHaveProperty('servername');
    }
  });

  it('accepts a PEM trust bundle', async () => {
    config = { ...config, caCert: `${pem}\n${rootCertificates[1]}` };
    await client.request(config, 'GET', '/overview');
    expect(httpsMock.mock.calls[0][1].ca).toBe(config.caCert);
  });

  it('rejects oversized HTTPS bodies and destroys the request', async () => {
    responseBody = 'x'.repeat(8 * 1024 * 1024 + 1);
    await expect(client.request(config, 'GET', '/overview')).rejects.toThrow('8 MiB');
    expect(requests[0].destroy).toHaveBeenCalled();
  });

  it('rejects an invalid upstream status without throwing out of the response listener', async () => {
    status = 600;
    await expect(client.request(config, 'GET', '/overview')).rejects.toThrow('invalid HTTP status');
  });

  it.each([
    [{ tlsInsecure: true }, 'certificate verification'],
    [{ caCert: 'upstream-secret' }, 'Invalid CA certificate'],
    [{ caCert: '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----' }, 'Invalid CA certificate'],
    [{ caCert: `${pem}\nupstream-secret` }, 'Invalid CA certificate'],
    [{ tlsServername: 'https://management.invalid:15671' }, 'DNS hostname'],
    [{ tlsServername: '127.0.0.1' }, 'DNS hostname'],
  ])('rejects invalid trust options before either transport opens a connection: %j', async (overrides, message) => {
    config = { ...config, managementPort: 25671, ...overrides };
    await expect(client.request(config, 'GET', '/overview')).rejects.toThrow(message);
    const result = await detection.detect(4);
    expect(result).toMatchObject({ reachable: false, isRabbitMQ: false });
    expect(result.error).toContain(message);
    expect(result.error).not.toContain('upstream-secret');
    expect(httpsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['CERT_HAS_EXPIRED', 'host clock'],
    ['CERT_NOT_YET_VALID', 'host clock'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'hostname mismatch'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'CA PEM bundle'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CA PEM bundle'],
    ['ECONNREFUSED', 'connection refused'],
    ['UNEXPECTED_FAILURE', 'Check connectivity'],
  ])('reports %s safely and never falls back to HTTP', async (code, message) => {
    config = { ...config, managementPort: 25671 };
    failureCode = code;
    await expect(client.request(config, 'PUT', '/users/device', { password: 'secret' })).rejects.toThrow(message);
    const result = await detection.detect(4);
    expect(result).toMatchObject({ reachable: false, isRabbitMQ: false });
    expect(result.error).toContain(message);
    expect(result.error).not.toContain('upstream-secret');
    expect(httpsMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow HTTPS redirects', async () => {
    status = 302;
    await expect(client.request(config, 'GET', '/overview')).rejects.toThrow('HTTP 302');
    expect((await detection.detect(4)).isRabbitMQ).toBe(false);
    expect(httpsMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an HTTP endpoint override when TLS is requested', async () => {
    const base = jest.spyOn(client, 'managementApiBase').mockReturnValue('http://broker.invalid:15672');
    try {
      await expect(client.request(config, 'GET', '/overview')).rejects.toThrow('must use HTTPS');
      expect(httpsMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      base.mockRestore();
    }
  });

  it.each([400, 403, 404, 500])('does not echo upstream response secrets for HTTP %s', async (code) => {
    status = code;
    responseBody = JSON.stringify({ reason: 'upstream-secret' });
    await expect(client.request(config, 'GET', '/overview')).rejects.not.toThrow('upstream-secret');
  });

  it.each([undefined, null, 25672])(
    'uses management port %s for HTTP detection and management',
    async (managementPort) => {
      config = { ...config, port: 28883, managementPort, useTls: false, caCert: undefined, tlsServername: undefined };
      fetchMock.mockImplementation(async () => new Response(responseBody, { status: 200 }));
      expect((await detection.detect(4)).isRabbitMQ).toBe(true);
      await client.request(config, 'PUT', '/users/device', { tags: '' });
      expect(fetchMock).toHaveBeenCalledWith(
        `http://broker.invalid:${managementPort ?? 15672}/api/users/device`,
        expect.objectContaining({ method: 'PUT', body: '{"tags":""}' }),
      );
      expect(httpsMock).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])('preserves IPv6 addressing with a custom management port (TLS: %s)', (useTls) => {
    expect(client.managementApiBase({ ...config, host: '::1', managementPort: 25671, useTls })).toBe(
      `${useTls ? 'https' : 'http'}://[::1]:25671`,
    );
  });

  it('invalidates cached detection after the management port changes', async () => {
    expect((await detection.detect(4)).isRabbitMQ).toBe(true);
    expect((await detection.detect(4)).isRabbitMQ).toBe(true);
    expect(httpsMock).toHaveBeenCalledTimes(1);
    config = { ...config, managementPort: 25671 };
    expect((await detection.detect(4)).isRabbitMQ).toBe(true);
    expect(httpsMock).toHaveBeenCalledTimes(2);
    expect(httpsMock.mock.calls[1][0]).toBe('https://broker.invalid:25671/api/overview');
  });

  it('invalidates a cached successful detection after trust changes', async () => {
    expect((await detection.detect(4)).isRabbitMQ).toBe(true);
    expect((await detection.detect(4)).isRabbitMQ).toBe(true);
    expect(httpsMock).toHaveBeenCalledTimes(1);
    config = { ...config, tlsInsecure: true };
    expect((await detection.detect(4)).isRabbitMQ).toBe(false);
    expect(httpsMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled HTTPS request at the detection deadline', async () => {
    jest.useFakeTimers();
    stalled = true;
    const pending = detection.detect(4);
    await jest.advanceTimersByTimeAsync(5000);
    expect(await pending).toMatchObject({ reachable: false, error: expect.stringContaining('5000ms') });
    expect(requests[0].destroy).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('handles empty successful writes', async () => {
    status = 204;
    responseBody = '';
    await expect(client.request(config, 'PUT', '/users/device', {})).resolves.toBeNull();
  });
});
