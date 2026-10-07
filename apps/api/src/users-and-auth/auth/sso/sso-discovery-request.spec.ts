import { promises as dns } from 'node:dns';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { assertDiscoveryAddress, discoveryLookup, discoveryUrl, requestDiscoveryJson } from './sso-discovery-request';
import { SsoDiscoveryRoutesImplementation } from './sso-discovery.routes';

describe('SSO discovery destinations', () => {
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
  const routes = Object.create(SsoDiscoveryRoutesImplementation.prototype) as SsoDiscoveryRoutesImplementation;

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

  it('uses the checked DNS answer for the connection without a second resolution', async () => {
    const lookup = jest.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const url = discoveryUrl(origin.replace('127.0.0.1', 'idp.example'), '/discovery');
    await expect(requestDiscoveryJson(url)).resolves.toEqual({ issuer: 'http://local-idp' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(paths).toEqual(['/discovery']);
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
    await expect(requestDiscoveryJson(new URL('/large', origin), 5000, 32)).rejects.toThrow('size limit');
    await expect(requestDiscoveryJson(new URL('/stall', origin), 50)).rejects.toThrow('aborted');
    await expect(requestDiscoveryJson(new URL('/invalid', origin))).rejects.toThrow('Invalid discovery JSON');
    await expect(requestDiscoveryJson(new URL('/unavailable', origin))).rejects.toThrow('503');
  });
});
