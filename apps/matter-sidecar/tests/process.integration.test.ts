import { afterEach, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
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
async function launch(extraEnv: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, ['dist/apps/matter-sidecar/main.mjs'], {
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
    expect(version.build.revision).toMatch(/^[0-9a-f]{40}$/);
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
