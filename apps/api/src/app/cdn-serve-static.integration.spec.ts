// The /cdn mount serves uploaded files straight from STORAGE_ROOT, next to the
// SQLite database. This pins down that @nestjs/serve-static (send) refuses
// encoded traversal out of the CDN root, with the same raw request paths that
// reached files through the plugin frontend route.
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { request as httpRequest } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { cdnServeStaticOptions } from './cdn-serve-static';
import { rejectEmptyAuthorityTargets } from './empty-authority-target';

const SECRET = 'SECRET-2d81c6a0-outside-the-cdn-root';

describe('/cdn serve-static', () => {
  let storageRoot: string;
  let app: INestApplication;
  let port: number;

  function rawGet(path: string): Promise<{ status: number; body: string }> {
    return new Promise((resolvePromise, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  beforeAll(async () => {
    storageRoot = mkdtempSync(join(tmpdir(), 'cdn-traversal-'));
    mkdirSync(join(storageRoot, 'cdn', 'resources', '1'), { recursive: true });
    writeFileSync(join(storageRoot, 'cdn', 'resources', '1', 'image.txt'), 'image');
    writeFileSync(join(storageRoot, 'attraccess.sqlite'), SECRET);

    @Module({ imports: [ServeStaticModule.forRoot(cdnServeStaticOptions(join(storageRoot, 'cdn'), '/cdn'))] })
    class CdnModule {}

    // NestFactory, not Test.createTestingModule: serve-static picks its loader from the
    // HTTP adapter while the module compiles, and a testing module has none yet.
    app = await NestFactory.create(CdnModule, { logger: false });
    // As in configureBootstrapHttp: registered before the mount attaches on listen.
    app.use(rejectEmptyAuthorityTargets);
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    rmSync(storageRoot, { recursive: true, force: true });
  });

  it('serves a file inside the CDN root', async () => {
    await expect(rawGet('/cdn/resources/1/image.txt')).resolves.toEqual({ status: 200, body: 'image' });
  });

  it.each([
    '/cdn/../attraccess.sqlite',
    '/cdn/..%2fattraccess.sqlite',
    '/cdn/%2e%2e/attraccess.sqlite',
    '/cdn/%2e%2e%2fattraccess.sqlite',
    '/cdn/resources/1/..%2f..%2f..%2fattraccess.sqlite',
    '/cdn/..%5cattraccess.sqlite',
    '/cdn/%252e%252e%252fattraccess.sqlite',
  ])('does not serve %s', async (path) => {
    const res = await rawGet(path);

    expect(res.status).not.toBe(200);
    expect(res.body).not.toContain(SECRET);
  });

  // Outside jest the index.html fallback answers these with the absolute path of the
  // missing index file. Jest's realm hides that message, so assert the router answers.
  // Absolute-form targets reach the mount directly when nothing normalises them in front of Node.
  it.each([
    '/cdn/missing.png',
    '/cdn/',
    '/cdn/resources/1/',
    'http://localhost/cdn/missing.png',
    'http://localhost:1/cdn/',
    'http:///cdn/missing.png',
    'http:///cdn',
    'http:///cdn/',
    'HTTP:///cdn',
    'HTTP:///cdn/',
    'Http:///cdn/',
    'https:///cdn',
    'https:///cdn/',
    'HTTPS:///cdn/',
    'hTtPs:///cdn/missing.png',
    'http:///cdn/?x=1',
    'http://:80/cdn/',
    'http://:/cdn/',
    'http://@/cdn/',
    'http://u:p@/cdn/',
    'http://@:80/cdn/',
    'http://a@b@/cdn/',
  ])('answers %s from the router, not the index fallback', async (path) => {
    const res = await rawGet(path);

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ message: `Cannot GET ${path}` });
    expect(res.body).not.toContain(storageRoot);
  });
});
