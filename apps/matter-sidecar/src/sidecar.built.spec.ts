import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { http } from './testing/harness';

const root = resolve(__dirname, '../../..');
const entry = join(root, 'dist/apps/matter-sidecar/main.js');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

type Started = {
  child: ChildProcess;
  port: number;
  stdout: string[];
  stderr: string[];
  exited: Promise<number | null>;
};

// Only PATH is passed on: no Attraccess API, database, fabric or Matter storage configuration exists.
function start(env: Record<string, string>, cwd: string): Started {
  const child = spawn(process.execPath, [entry], { cwd, env: { PATH: process.env.PATH ?? '', ...env } });
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on('data', (chunk) => stdout.push(String(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
  const exited = new Promise<number | null>((resolveExit) => child.once('exit', (code) => resolveExit(code)));
  return { child, port: 0, stdout, stderr, exited };
}

async function ready(started: Started): Promise<number> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const match = /"port":(\d+)/.exec(started.stdout.join(''));
    if (match) return Number(match[1]);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`sidecar did not start: ${started.stderr.join('')}`);
}

describe('built sidecar process', () => {
  let cwd: string;
  const children: ChildProcess[] = [];
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'matter-sidecar-'));
  });
  afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
    rmSync(cwd, { recursive: true, force: true });
  });

  const launch = (env: Record<string, string> = { MATTER_SIDECAR_PORT: '0' }) => {
    const started = start(env, cwd);
    children.push(started.child);
    return started;
  };

  it('starts on its own, loads the pinned matter.js and reports exact versions and Git revision', async () => {
    const started = launch();
    const port = await ready(started);
    const version = (await http(port, 'GET', '/version')).body;
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    expect(version.build.commit).toBe(head);
    expect(version.build.version).toBe(`${version.sidecar}+${head.slice(0, 12)}`);
    expect(version.matterJs).toBe(rootPackage.dependencies['@matter/main']);
    expect(version.matterJs).toBe(COMPATIBILITY_TABLE[0].matterJs);
    expect(version.sidecar).toBe(COMPATIBILITY_TABLE[0].sidecar);
    expect(version).toMatchObject({ wireVersion: 1, storageSchemaVersion: 1 });
    const readiness = await http(port, 'GET', '/health/ready');
    expect(readiness.body).toMatchObject({ status: 'ready', fabric: { state: 'uninitialized' } });
    expect(readdirSync(cwd)).toEqual([]); // no Matter storage was written, no fabric was created
    started.child.kill('SIGTERM');
    expect(await started.exited).toBe(0);
  });

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'shuts down on %s, tolerates repeated signals and exits within the grace period',
    async (signal) => {
      const started = launch({ MATTER_SIDECAR_PORT: '0', MATTER_SIDECAR_SHUTDOWN_GRACE_MS: '2000' });
      await ready(started);
      const began = Date.now();
      started.child.kill(signal);
      started.child.kill(signal);
      started.child.kill('SIGTERM');
      expect(await started.exited).toBe(0);
      expect(Date.now() - began).toBeLessThan(5_000);
    },
  );

  it('fails fast with an actionable message on invalid configuration', async () => {
    const started = launch({ MATTER_SIDECAR_PORT: 'banana' });
    expect(await started.exited).toBe(1);
    expect(started.stderr.join('')).toMatch(/MATTER_SIDECAR_PORT.*Fix the MATTER_SIDECAR_\* environment variables/s);
    expect(started.stderr.join('')).not.toMatch(/\n\s+at /);
    expect(started.stdout.join('')).not.toContain('listening');
  });

  it('ends only itself when the port is already taken', async () => {
    const first = launch();
    const port = await ready(first);
    const second = launch({ MATTER_SIDECAR_PORT: String(port) });
    expect(await second.exited).toBe(1);
    expect(second.stderr.join('')).toMatch(/Set MATTER_SIDECAR_PORT to a free port\. Only the sidecar stopped/);
    expect(second.stderr.join('')).not.toMatch(/\n\s+at /); // no stack trace for an expected operational failure
    expect((await http(port, 'GET', '/health/live')).status).toBe(200);
  });
});
