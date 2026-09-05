import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { describeManagementError, managementRequest } from './rabbitmq-management-transport';

describe('management TLS with an isolated loopback CA', () => {
  let directory: string;
  let server: Server;
  let caCert: string;
  let url: string;
  const config: MqttServerConnectionConfig = {
    id: 1,
    name: 'Loopback fixture',
    host: '127.0.0.1',
    port: 8883,
    useTls: true,
    username: 'fixture',
    password: 'fixture-only',
    clientId: null,
    tlsServername: 'localhost',
  };

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'wago-management-tls-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'ca.pem'),
      ],
      { stdio: 'ignore' },
    );
    caCert = readFileSync(join(directory, 'ca.pem'), 'utf8');
    server = createServer({ key: readFileSync(join(directory, 'key.pem')), cert: caCert }, (request, response) => {
      if (request.url === '/oversized') {
        response.end(Buffer.alloc(8 * 1024 * 1024 + 1));
        return;
      }
      if (request.url === '/stream') {
        const timer = setInterval(() => response.write('fixture'), 10);
        response.on('close', () => clearInterval(timer));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"fixture":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `https://127.0.0.1:${(server.address() as AddressInfo).port}/api/overview`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('authenticates a private-CA management listener with matching DNS identity', async () => {
    const response = await managementRequest({ ...config, caCert }, url, 'GET', undefined, 2000);
    expect(await response.json()).toEqual({ fixture: true });
  });

  it('rejects untrusted certificates rather than falling back to HTTP', async () => {
    await expect(managementRequest(config, url, 'GET', undefined, 2000)).rejects.toThrow();
  });

  it('bounds a real HTTPS response before buffering the entire body', async () => {
    const error = await managementRequest(
      { ...config, caCert },
      new URL('/oversized', url).href,
      'GET',
      undefined,
      2000,
    ).catch((failure) => failure);
    expect(describeManagementError(error, 2000)).toContain('8 MiB');
  });

  it('keeps the deadline active while a response streams continuously', async () => {
    const error = await managementRequest(
      { ...config, caCert },
      new URL('/stream', url).href,
      'GET',
      undefined,
      100,
    ).catch((failure) => failure);
    expect(describeManagementError(error, 100)).toContain('100ms');
  });

  it('rejects a hostname mismatch with actionable non-secret feedback', async () => {
    const error = await managementRequest(
      { ...config, caCert, tlsServername: 'wrong.example.test' },
      url,
      'GET',
      undefined,
      2000,
    ).catch((failure) => failure);
    expect(describeManagementError(error, 2000)).toContain('hostname mismatch');
  });
});
