import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Resource, ResourceType, Attractap } from '@attraccess/database-entities';
import { SettingsService } from '../settings/settings.service';
import { AttractapGateway } from '../attractap/websockets/websocket.gateway';
import { bootstrap } from '../main.bootstrap';
import { ChildProcess, execFileSync, spawn } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const repositoryRoot = resolve(__dirname, '../../../..');
const buildDirectory = join(repositoryRoot, 'dist/apps/attractap-desktop');
const probe = join(buildDirectory, 'attractap-desktop-real-api');
const nonProfitLicense =
  'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';

function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolveWait, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = async () => {
      if (await condition()) return resolveWait();
      if (Date.now() >= deadline) return reject(new Error('Timed out waiting for desktop simulator fixture'));
      setTimeout(check, 25);
    };
    void check();
  });
}

function waitForExit(process: ChildProcess): Promise<number> {
  return new Promise((resolveExit, reject) => {
    process.once('error', reject);
    process.once('exit', (code) => resolveExit(code ?? 1));
  });
}

describe('desktop simulator against a real API', () => {
  let app: INestApplication;
  let fixtureRoot: string;
  let simulator: ChildProcess | undefined;

  beforeAll(async () => {
    // Build only the native probe; it links the same DesktopSimulator used by the app.
    execFileSync('cmake', ['-S', 'apps/attractap/desktop', '-B', buildDirectory], { cwd: repositoryRoot });
    execFileSync('cmake', ['--build', buildDirectory, '--target', 'attractap-desktop-real-api'], { cwd: repositoryRoot });

    ({ app } = await bootstrap());
    await app.init();
    await app.get(SettingsService).updateAppSettings({ licenseKey: nonProfitLicense });
    await app.listen(0, '127.0.0.1');
  }, 120_000);

  afterEach(() => {
    simulator?.kill();
    simulator = undefined;
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, receives a live resource list, captures frames, and reconnects', async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'attractap-desktop-real-api-'));
    const ready = join(fixtureRoot, 'ready');
    const release = join(fixtureRoot, 'release');
    const screenshots = join(fixtureRoot, 'screenshots');
    const server = app.getHttpServer().address();
    if (!server || typeof server === 'string') throw new Error('Test API did not bind a TCP port');

    simulator = spawn(probe, [`http://127.0.0.1:${server.port}`, ready, release, screenshots], {
      cwd: repositoryRoot,
      env: { ...process.env, SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software' },
      stdio: 'pipe',
    });
    const exit = waitForExit(simulator);

    await waitFor(() => existsSync(ready));

    const dataSource = app.get(DataSource);
    const resource = await dataSource.getRepository(Resource).save({
      name: 'Desktop E2E Mill',
      type: ResourceType.Machine,
    });
    const [reader] = await dataSource.getRepository(Attractap).find({ relations: ['resources'], take: 1 });
    if (!reader) throw new Error('Desktop simulator did not register a reader');
    reader.resources = [resource];
    await dataSource.getRepository(Attractap).save(reader);
    await app.get(AttractapGateway).sendResourceList(reader.id);

    writeFileSync(release, 'resource list attached\n');
    await expect(exit).resolves.toBe(0);
    expect(existsSync(join(screenshots, 'resource-list.png'))).toBe(true);
    expect(existsSync(join(screenshots, 'reconnected.png'))).toBe(true);
  }, 45_000);
});
