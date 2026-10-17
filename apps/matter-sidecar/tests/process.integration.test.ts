import { afterEach, it, expect } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { createConnection } from 'node:net';
import { WebSocket } from 'ws';
import { fixtures } from '@attraccess/matter-contract/testing';
import { MATTER_JS_RELEASE, SUPPORTED_RELEASE, VersionResponse } from '@attraccess/matter-contract';

const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
});
async function launch(extraEnv: NodeJS.ProcessEnv = {}, entryPoint = 'dist/apps/matter-sidecar/main.mjs') {
  const child = spawn(process.execPath, [entryPoint], {
    env: { PATH: process.env.PATH, MATTER_PORT: '0', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (data) => (stdout += data));
  child.stderr?.on('data', (data) => (stderr += data));
  const closed = once(child, 'exit');
  const deadline = Date.now() + 15000;
  while (!stdout.includes('Matter sidecar ready') && child.exitCode === null && child.signalCode === null) {
    if (Date.now() > deadline) throw new Error('Built sidecar did not become ready: ' + stderr);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const url = stdout.match(/http:\/\/[^;\s]+/)?.[0];
  return { child, closed, url, stdout: () => stdout, stderr: () => stderr };
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  it(`starts independently with the pinned native platform and drains on ${signal}`, async () => {
    const process = await launch();
    if (!process.url) throw new Error(process.stderr());
    const version = VersionResponse.parse(await (await fetch(process.url + '/version')).json());
    expect(version.matterJsRelease).toBe(MATTER_JS_RELEASE);
    expect(version.sidecarRelease).toBe(SUPPORTED_RELEASE.sidecar);
    const packageVersion = JSON.parse(readFileSync('apps/matter-sidecar/package.json', 'utf8')).version;
    expect(version.sidecarRelease).toBe(packageVersion);
    expect(version.build.version).toBe(packageVersion);
    expect(version.build.revision).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
    expect(await (await fetch(process.url + '/health/ready')).json()).toMatchObject({
      ready: true,
      fabricInitialized: false,
    });
    const ws = new WebSocket(process.url.replace('http:', 'ws:') + '/v1/events', {
      headers: fixtures.CompatibilityHeaders as Record<string, string>,
    });
    ws.on('error', () => undefined);
    await once(ws, 'open');
    const wsClosed = once(ws, 'close');
    const before = Date.now();
    process.child.kill(signal);
    const [code] = await process.closed;
    expect(code, process.stderr()).toBe(0);
    expect(Date.now() - before).toBeLessThan(6000);
    await wsClosed;
    expect(process.stderr()).toBe('');
  });
it('invalid configuration exits only the sidecar with an actionable safe diagnostic', async () => {
  const process = await launch({ MATTER_HOST: '0.0.0.0' });
  const [code] = await process.closed;
  expect(code).toBe(1);
  expect(process.url).toBeUndefined();
  expect(process.stderr()).toMatch(/initialization failed.*MATTER_HOST/);
  const healthy = await launch();
  expect((await fetch(healthy.url + '/health/live')).status).toBe(200);
});
it('stays alive after real TCP resets during rejected WebSocket upgrades', async () => {
  const sidecar = await launch();
  if (!sidecar.url) throw new Error(sidecar.stderr());
  const port = Number(new URL(sidecar.url).port);
  for (let attempt = 0; attempt < 20; attempt++) {
    const client = createConnection({ host: '127.0.0.1', port });
    client.on('error', () => undefined);
    const closed = new Promise<void>((resolve) => client.once('close', () => resolve()));
    await once(client, 'connect');
    client.write(
      'GET /v2/events HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
      () => client.resetAndDestroy(),
    );
    await closed;
  }
  expect((await fetch(sidecar.url + '/health/live')).status).toBe(200);
  expect(sidecar.child.exitCode).toBeNull();
  expect(sidecar.stderr()).toBe('');
});

it.each(['0.1.0--rc.1', '0.1.0-0.a--b.1+001.a-b'])(
  'starts a native prerelease build %s with diagnostics and exact release rejection',
  async (release) => {
    const directory = mkdtempSync('dist/apps/matter-sidecar/diagnostic-');
    try {
      const entryPoint = `${directory}/main.mjs`;
      await build({
        entryPoints: ['apps/matter-sidecar/src/main.ts'],
        outfile: entryPoint,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        external: ['@matter/*', 'ws'],
        define: { BUILD_REVISION: JSON.stringify('prerelease-regression'), BUILD_VERSION: JSON.stringify(release) },
      });
      const sidecar = await launch({}, entryPoint);
      if (!sidecar.url) throw new Error(sidecar.stderr());
      const version = VersionResponse.parse(await (await fetch(sidecar.url + '/version')).json());
      expect(version.build.version).toBe(release);
      expect(version.sidecarRelease).toBe(release);
      expect((await fetch(sidecar.url + '/health/ready')).status).toBe(200);
      const response = await fetch(sidecar.url + '/v1/capabilities', {
        headers: fixtures.CompatibilityHeaders as Record<string, string>,
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: 'INCOMPATIBLE_RELEASE', details: { received: { sidecar: release } } },
      });
      sidecar.child.kill('SIGTERM');
      expect((await sidecar.closed)[0], sidecar.stderr()).toBe(0);
      expect(sidecar.stderr()).toBe('');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
