// The public module-federation route must serve a plugin's frontend files and
// nothing else. Express 5 percent-decodes each wildcard segment, so encoded
// separators and dot segments reach the handler as path syntax; this boots the
// real Nest/Express stack against a synthetic plugin and sends raw request
// paths (no client-side URL normalization) to prove they cannot escape.
import 'reflect-metadata';
import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { IncomingHttpHeaders, request as httpRequest } from 'http';
import { AddressInfo } from 'net';
import { dirname, join } from 'path';
import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import { PluginService } from './plugin.service';
import { PluginModule } from './plugin.module';
import { MqttClientService } from '../mqtt/mqtt-client.service';
import { MqttServerService } from '../mqtt/servers/mqtt-server.service';

let hostDataSource: DataSource;

@Global()
@Module({
  providers: [
    { provide: AUDIT_RECORDER, useValue: { record: jest.fn().mockResolvedValue({ status: 'recorded' }) } },
    { provide: DataSource, useFactory: () => hostDataSource },
  ],
  exports: [AUDIT_RECORDER, DataSource],
})
class HostModule {}

const PLUGIN_NAME = 'demo-frontend-assets';
const CANARY = 'CANARY-7f3e9c1d-must-never-be-served';
const MANIFEST_MARKER = 'manifest-marker-4b21';

function findRepoRoot(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('repo root (pnpm-workspace.yaml) not found');
}

const REPO_ROOT = findRepoRoot(__dirname);
const CACHE_DIR = join(REPO_ROOT, 'node_modules', '.cache', 'plugin-frontend-assets');
const PLUGIN_PATH = join(CACHE_DIR, 'plugins');
const PLUGIN_DIR = join(PLUGIN_PATH, PLUGIN_NAME);
const FRONTEND_DIR = join(PLUGIN_DIR, 'frontend');
// three levels above the frontend directory: frontend -> plugin -> plugins -> cache
const CANARY_FILE = join(CACHE_DIR, 'canary.txt');

const BASE = `/plugins/${PLUGIN_NAME}/frontend/module-federation`;

type RawResponse = { status: number; body: string; contentType?: string; headers: IncomingHttpHeaders };

describe('plugin frontend module-federation route', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let port: number;

  // Node's http client sends `path` verbatim, unlike WHATWG URL parsing, which
  // would collapse `..` and `%2e%2e` before the request leaves the client.
  function rawGet(path: string): Promise<RawResponse> {
    return new Promise((resolvePromise, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolvePromise({
            status: res.statusCode ?? 0,
            body,
            contentType: res.headers['content-type'],
            headers: res.headers,
          }),
        );
      });
      req.on('error', reject);
      req.end();
    });
  }

  beforeAll(async () => {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    mkdirSync(join(FRONTEND_DIR, 'assets', 'sub'), { recursive: true });
    writeFileSync(CANARY_FILE, CANARY);
    writeFileSync(
      join(PLUGIN_DIR, 'plugin.json'),
      JSON.stringify({
        name: PLUGIN_NAME,
        version: '0.1.0',
        description: MANIFEST_MARKER,
        main: { frontend: { directory: 'frontend', entryPoint: 'remoteEntry.js' } },
        attraccessVersion: { min: '2.0.0-0' },
        permissions: [],
      }),
    );
    writeFileSync(join(FRONTEND_DIR, 'remoteEntry.js'), 'export const remote = "entry";');
    writeFileSync(join(FRONTEND_DIR, 'style.css'), '.plugin { color: red; }');
    writeFileSync(join(FRONTEND_DIR, 'assets', 'sub', 'chunk.js'), 'export const nested = "chunk";');
    writeFileSync(join(FRONTEND_DIR, 'assets', 'chunk,with,commas.js'), 'export const commas = true;');

    jest
      .spyOn(PluginService.prototype as unknown as { restartApp: () => void }, 'restartApp')
      .mockImplementation(() => undefined);

    PluginService.configure({ PLUGIN_DIR: PLUGIN_PATH, RESTART_BY_EXIT: true });
    PluginModule.configure({ DISABLE_PLUGINS: false });

    dataSource = new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: ':memory:',
      synchronize: true,
      entities: [],
    });
    await dataSource.initialize();
    hostDataSource = dataSource;

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), HostModule, PluginModule.forRoot()],
    })
      .overrideProvider(MqttClientService)
      .useValue({ subscribe: jest.fn(), unsubscribe: jest.fn(), publish: jest.fn() })
      .overrideProvider(MqttServerService)
      .useValue({ findOne: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    // Same global pipe as main.bootstrap.ts: implicit conversion turns a
    // `string`-typed wildcard param into a comma-joined string.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    jest.restoreAllMocks();
    rmSync(CACHE_DIR, { recursive: true, force: true });
  });

  it.each([
    ['remoteEntry.js', 'application/javascript', 'export const remote = "entry";'],
    ['assets/sub/chunk.js', 'application/javascript', 'export const nested = "chunk";'],
    ['style.css', 'text/css', '.plugin { color: red; }'],
    ['assets/chunk,with,commas.js', 'application/javascript', 'export const commas = true;'],
  ])('serves %s without a session', async (file, contentType, content) => {
    const res = await rawGet(`${BASE}/${file}`);

    expect(res.status).toBe(200);
    expect(res.contentType).toContain(contentType);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toBe(content);
  });

  const canaryAbsolute = encodeURIComponent(CANARY_FILE);

  it.each([
    ['encoded slash to the manifest', '..%2fplugin.json'],
    ['encoded dots to the manifest', '%2e%2e/plugin.json'],
    ['fully encoded traversal to the manifest', '%2e%2e%2fplugin.json'],
    ['mixed-case encoded slash', '..%2Fplugin.json'],
    ['encoded slash out of the plugin path', '..%2f..%2f..%2fcanary.txt'],
    ['encoded dots out of the plugin path', '%2e%2e/%2e%2e/%2e%2e/canary.txt'],
    ['double-encoded traversal', '%252e%252e%252fplugin.json'],
    ['double-encoded traversal out of the plugin path', '%252e%252e%252f%252e%252e%252f%252e%252e%252fcanary.txt'],
    ['absolute path', '%2fetc%2fpasswd'],
    ['absolute canary path', canaryAbsolute],
    ['encoded backslash', '..%5cplugin.json'],
    ['encoded backslash out of the plugin path', '..%5c..%5c..%5ccanary.txt'],
    ['NUL byte', 'remoteEntry.js%00.css'],
    ['NUL byte after traversal', '..%2fplugin.json%00'],
    ['comma-joined traversal', '..,plugin.json'],
    ['comma-joined traversal out of the plugin path', '..,..,..,canary.txt'],
    ['traversal inside a nested path', 'assets/..%2f..%2fplugin.json'],
    ['the frontend directory itself', '.'],
  ])('refuses %s with a plain 404', async (_label, path) => {
    const res = await rawGet(`${BASE}/${path}`);
    // the handler answered, not the router: same body as an ordinary missing file
    const missing = await rawGet(`${BASE}/missing.js`);

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual(JSON.parse(missing.body));
    expect(res.body).not.toContain(CANARY);
    expect(res.body).not.toContain(MANIFEST_MARKER);
    expect(res.body).not.toContain('root:');
    expect(res.body).not.toContain(CACHE_DIR);
    expect(res.body).not.toContain('plugin.json');
    expect(res.body).not.toContain('canary');
  });

  it('returns the same 404 for a missing file and a traversal attempt', async () => {
    const missing = await rawGet(`${BASE}/missing.js`);
    const traversal = await rawGet(`${BASE}/..%2fplugin.json`);

    expect(missing.status).toBe(404);
    expect(traversal.status).toBe(404);
    expect(JSON.parse(traversal.body)).toEqual(JSON.parse(missing.body));
  });
});
