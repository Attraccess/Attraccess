import { promises as dns } from 'node:dns';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { BadRequestException, HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { SSOController } from './sso.controller';
import {
  assertDiscoveryAddress,
  discoveryLookup,
  discoveryUrl,
  requestDiscoveryJson,
  toDiscoveryError,
} from './providers/discovery-client';

async function expectBadGateway(promise: Promise<unknown>, ...messages: string[]): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(502);
  messages.forEach((message) => expect((error as HttpException).message).toContain(message));
}

async function refusedOrigin(): Promise<string> {
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const { port } = closed.address() as AddressInfo;
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

describe('SSO discovery destinations', () => {
  it.each(['discoverAuthentik', 'discoverKeycloak'] as const)('requires SSO management permission for %s', (method) => {
    const handler = SSOController.prototype[method];
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
      expect.arrayContaining([DualAuthGuard, EffectivePermissionsGuard]),
    );
    const request = { user: undefined as { id: number; effectivePermissions: Set<string> } | undefined };
    const context = new ExecutionContextHost([request], SSOController, handler);
    const guard = new EffectivePermissionsGuard(new Reflector());
    expect(() => guard.canActivate(context)).toThrow('Unauthorized');
    request.user = { id: 1, effectivePermissions: new Set() };
    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    request.user.effectivePermissions.add('system.sso.manage');
    expect(guard.canActivate(context)).toBe(true);
  });

  it.each([
    'http://169.254.169.254',
    'http://0xa9fea9fe',
    'http://2852039166',
    'http://[::ffff:169.254.169.254]',
    'http://[fd00:ec2::254]',
    'http://168.63.129.16',
    'http://100.100.100.200',
    'http://0.0.0.0',
    'http://224.0.0.1',
    'http://[64:ff9b::a9fe:a9fe]',
    'http://[2002:a9fe:a9fe::1]',
    'http://user:password@idp.example',
    'http://idp.example?url=x',
    'http://idp.example#fragment',
    'http://idp.example/path',
    'http://idp.example\\@169.254.169.254',
    'file:///etc/passwd',
  ])('rejects unsafe origins before a request: %s', (host) => {
    expect(() => discoveryUrl(host, '/discovery')).toThrow();
  });

  it.each(['127.0.0.1', '192.168.1.10', '10.0.0.10', '172.16.0.1', 'fd12::1', '::1'])(
    'preserves private and loopback IdPs: %s',
    (address) => expect(() => assertDiscoveryAddress(address)).not.toThrow(),
  );

  it('checks every DNS answer, including mixed safe/metadata answers', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '192.168.1.10', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    try {
      const error = await new Promise((resolve) => discoveryLookup('idp.example', {}, (error) => resolve(error)));
      expect(error).toBeInstanceOf(Error);
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('SSO discovery HTTP boundaries', () => {
  let server: Server;
  let origin: string;
  const paths: string[] = [];
  const routes = Object.create(SSOController.prototype) as SSOController;

  beforeEach(async () => {
    paths.length = 0;
    server = createServer((req, res) => {
      paths.push(req.url ?? '/');
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
      } else if (req.url === '/stall') {
        // The absolute request deadline must include waiting for headers.
      } else if (req.url === '/large') {
        res.end(JSON.stringify('x'.repeat(1000)));
      } else if (req.url === '/invalid') {
        res.end('{');
      } else if (req.url === '/unavailable') {
        res.writeHead(503);
        res.end();
      } else {
        res.end(JSON.stringify({ issuer: 'http://local-idp' }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    jest.restoreAllMocks();
  });

  it('preserves both discovery paths on a local HTTP identity provider', async () => {
    await expect(routes.discoverAuthentik(origin, 'team name')).resolves.toEqual({ issuer: 'http://local-idp' });
    await expect(routes.discoverKeycloak(origin, 'team name')).resolves.toEqual({ issuer: 'http://local-idp' });
    expect(paths).toEqual([
      '/application/o/team%20name/.well-known/openid-configuration',
      '/realms/team%20name/.well-known/openid-configuration',
    ]);
    await expect(routes.discoverAuthentik(origin, '..')).rejects.toThrow('Invalid discovery path');
  });

  it.each([
    '.',
    '..',
    '../other',
    '../../other',
    'team/other',
    'team\\other',
    '%2e%2e',
    '%2e%2e%2fother',
    '%252e%252e%252fother',
    '%25%32%65%25%32%65%25%32%66other',
    '..%5cother',
    '%invalid%2fother',
    '..;parameters',
    '%2e%2e%3bparameters',
    '%' + '25'.repeat(9) + '2fother',
  ])('rejects a provider identifier that can leave its path component: %s', async (name) => {
    await expect(routes.discoverAuthentik(origin, name)).rejects.toThrow('Invalid discovery path');
    await expect(routes.discoverKeycloak(origin, name)).rejects.toThrow('Invalid discovery path');
    expect(paths).toEqual([]);
  });

  it.each(['team_name-v1.2', 'team name', 'Überblick', 'discount 20%', 'percent%literal'])(
    'preserves a valid provider identifier: %s',
    async (name) => {
      await expect(routes.discoverAuthentik(origin, name)).resolves.toEqual({ issuer: 'http://local-idp' });
      await expect(routes.discoverKeycloak(origin, name)).resolves.toEqual({ issuer: 'http://local-idp' });
      expect(paths).toEqual([
        `/application/o/${encodeURIComponent(name)}/.well-known/openid-configuration`,
        `/realms/${encodeURIComponent(name)}/.well-known/openid-configuration`,
      ]);
    },
  );

  it('uses the checked DNS answer for the connection without a second resolution', async () => {
    const lookup = jest.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const url = discoveryUrl(origin.replace('127.0.0.1', 'idp.example'), '/discovery');
    await expect(requestDiscoveryJson(url)).resolves.toEqual({ issuer: 'http://local-idp' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(paths).toEqual(['/discovery']);
  });

  it.each([
    '0.0.0.0',
    '[::]',
    '169.254.169.254',
    '0xa9fea9fe',
    '2852039166',
    '[::ffff:169.254.169.254]',
    '[fd00:ec2::254]',
    '168.63.129.16',
    '100.100.100.200',
    '224.0.0.1',
    '[64:ff9b::a9fe:a9fe]',
    '[2002:a9fe:a9fe::1]',
  ])('rejects a forbidden literal destination at the request boundary: %s', async (host) => {
    const lookup = jest.spyOn(dns, 'lookup');
    const url = new URL('/discovery', origin.replace('127.0.0.1', host));
    await expect(requestDiscoveryJson(url, 500)).rejects.toThrow('Invalid discovery destination');
    expect(lookup).not.toHaveBeenCalled();
    expect(paths).toEqual([]);
  });

  it.each([
    { address: '::1', family: 6 },
    { address: '127.0.0.2', family: 4 },
  ])('falls back from an unreachable validated address: $address', async (unreachable) => {
    const lookup = jest.spyOn(dns, 'lookup').mockResolvedValueOnce([unreachable, { address: '127.0.0.1', family: 4 }]);
    const url = discoveryUrl(origin.replace('127.0.0.1', 'idp.example'), '/discovery');
    await expect(requestDiscoveryJson(url)).resolves.toEqual({ issuer: 'http://local-idp' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(paths).toEqual(['/discovery']);
  });

  it('rejects metadata DNS results before connecting', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '127.0.0.1', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    const url = discoveryUrl(origin.replace('127.0.0.1', 'idp.example'), '/discovery');
    await expect(requestDiscoveryJson(url)).rejects.toThrow('Invalid discovery destination');
    expect(paths).toEqual([]);
  });

  it('does not follow a redirect to metadata', async () => {
    await expect(requestDiscoveryJson(new URL('/redirect', origin))).rejects.toThrow('302');
    expect(paths).toEqual(['/redirect']);
  });

  it('bounds response size and request duration and rejects malformed JSON/non-success responses', async () => {
    await expectBadGateway(requestDiscoveryJson(new URL('/large', origin), 5000, 32), 'size limit');
    await expectBadGateway(
      requestDiscoveryJson(new URL('/stall', origin), 50),
      `Discovery URL could not be reached: ${origin} (timed out after 50 ms)`,
    );
    await expectBadGateway(requestDiscoveryJson(new URL('/invalid', origin)), 'Invalid discovery JSON');
    await expect(requestDiscoveryJson(new URL('/unavailable', origin))).rejects.toThrow('503');
  });

  it('reports a refused connection as an unreachable discovery URL', async () => {
    const refused = await refusedOrigin();
    await expectBadGateway(
      requestDiscoveryJson(new URL('/discovery', refused)),
      `Discovery URL could not be reached: ${refused} (ECONNREFUSED)`,
    );
    await expectBadGateway(routes.discoverKeycloak(refused, 'realm'), 'could not be reached', 'ECONNREFUSED');
    await expectBadGateway(routes.discoverAuthentik(refused, 'app'), 'could not be reached', 'ECONNREFUSED');
  });

  it('reports a failed DNS resolution as an unreachable discovery URL', async () => {
    jest
      .spyOn(dns, 'lookup')
      .mockRejectedValueOnce(Object.assign(new Error('getaddrinfo ENOTFOUND idp.example'), { code: 'ENOTFOUND' }));
    const url = discoveryUrl(origin.replace('127.0.0.1', 'idp.example'), '/discovery');
    await expectBadGateway(requestDiscoveryJson(url), `Discovery URL could not be reached: ${url.origin} (ENOTFOUND)`);
    expect(paths).toEqual([]);
  });

  it('reports a host without addresses as an unreachable discovery URL', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValueOnce([]);
    const url = discoveryUrl(origin.replace('127.0.0.1', 'idp.example'), '/discovery');
    await expectBadGateway(requestDiscoveryJson(url), `Discovery URL could not be reached: ${url.origin}`);
    expect(paths).toEqual([]);
  });

  it('reports a dropped response body as an unreachable discovery URL', async () => {
    server.removeAllListeners('request');
    server.on('request', (_req, res) => {
      res.writeHead(200, { 'Content-Length': '100' });
      res.write('{');
      setImmediate(() => res.destroy());
    });
    // A short deadline keeps the timeout path from satisfying this assertion.
    await expectBadGateway(
      requestDiscoveryJson(new URL('/discovery', origin), 1000),
      `Discovery URL could not be reached: ${origin} (ECONNRESET)`,
    );
  });
});

describe('toDiscoveryError', () => {
  const url = new URL('http://idp.example:8080/realms/x/.well-known/openid-configuration');

  it('keeps HTTP exceptions such as destination policy rejections unchanged', () => {
    const policy = new BadRequestException('Invalid discovery destination');
    expect(toDiscoveryError(policy, url, true, 50)).toBe(policy);
  });

  it('omits the reason when neither a timeout nor an error code is known', () => {
    const error = toDiscoveryError(new Error('Discovery host has no addresses 10.0.0.1'), url, false, 50);
    expect(error.getStatus()).toBe(502);
    expect(error.message).toBe('Discovery URL could not be reached: http://idp.example:8080');
  });

  it('prefers the timeout over the socket error code', () => {
    const error = toDiscoveryError(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }), url, true, 50);
    expect(error.message).toBe('Discovery URL could not be reached: http://idp.example:8080 (timed out after 50 ms)');
  });
});
