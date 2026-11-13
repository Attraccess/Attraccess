import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { http, validHeaders } from './testing/harness';

const root = resolve(__dirname, '../../..');
const TOKEN = 'built-test-token-0123456789abcdef0123456789';
const authorized = { authorization: `Bearer ${TOKEN}` };
const entry = join(root, 'dist/apps/matter-sidecar/main.js');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

type Started = {
  child: ChildProcess;
  port: number;
  stdout: string[];
  stderr: string[];
  exited: Promise<number | null>;
};

// Only PATH is passed on: no Attraccess API, database, fabric or Matter storage configuration exists, so the default
// storage directory (./matter-storage in the working directory) applies.
function start(env: Record<string, string>, cwd: string, nodeArgs: string[] = []): Started {
  const child = spawn(process.execPath, [...nodeArgs, entry], { cwd, env: { PATH: process.env.PATH ?? '', ...env } });
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

  const launch = (env: Record<string, string> = { MATTER_SIDECAR_PORT: '0' }, nodeArgs: string[] = []) => {
    const started = start({ MATTER_SIDECAR_AUTH_TOKEN: TOKEN, ...env }, cwd, nodeArgs);
    children.push(started.child);
    return started;
  };

  it('starts on its own, loads the pinned matter.js and reports exact versions and Git revision', async () => {
    const started = launch();
    const port = await ready(started);
    const version = (await http(port, 'GET', '/version', { headers: authorized })).body;
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    expect(version.build.commit).toBe(head);
    expect(version.build.version).toBe(`${version.sidecar}+${head.slice(0, 12)}`);
    expect(version.matterJs).toBe(rootPackage.dependencies['@matter/main']);
    expect(version.matterJs).toBe(COMPATIBILITY_TABLE[0].matterJs);
    expect(version.sidecar).toBe(COMPATIBILITY_TABLE[0].sidecar);
    expect(version).toMatchObject({ wireVersion: 1, storageSchemaVersion: 1 });
    const readiness = await http(port, 'GET', '/health/ready');
    expect(readiness.body).toMatchObject({ status: 'ready', fabric: { state: 'uninitialized' } });
    // The storage directory exists (owner-only) but stays empty: no Matter state was written and no fabric was created.
    expect(readdirSync(cwd)).toEqual(['matter-storage']);
    expect(readdirSync(join(cwd, 'matter-storage'))).toEqual([]);
    started.child.kill('SIGTERM');
    expect(await started.exited).toBe(0);
  });

  it('keeps every file and directory of the fabric storage owner-only, also after matter.js rewrote them', async () => {
    const started = launch();
    const port = await ready(started);
    const created = await http(port, 'POST', '/v1/fabric', {
      headers: { ...validHeaders(), ...authorized, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Permissions' }),
    });
    expect(created.status).toBe(200);
    const loose: string[] = [];
    // matter.js writes through temporary files that it renames while the sidecar runs: one that vanished is not loose.
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        let stat;
        try {
          stat = statSync(path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        if ((stat.mode & 0o077) !== 0) loose.push(path);
        if (stat.isDirectory()) walk(path);
      }
    };
    walk(join(cwd, 'matter-storage'));
    expect(loose).toEqual([]);
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

  it('treats a stop signal during startup as a normal stop, not a startup failure', async () => {
    const started = launch({ MATTER_SIDECAR_PORT: '0' }, ['--require', join(__dirname, 'testing/delay-listen.cjs')]);
    const deadline = Date.now() + 45_000;
    while (!started.stderr.join('').includes('listen delayed') && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    expect(started.stderr.join('')).toContain('listen delayed');
    started.child.kill('SIGTERM');
    expect(await started.exited).toBe(0);
    expect(started.stderr.join('')).not.toContain('could not start');
    expect(started.stdout.join('')).not.toContain('listening');
  });

  it('fails fast with an actionable message on invalid configuration', async () => {
    const started = launch({ MATTER_SIDECAR_PORT: 'banana' });
    expect(await started.exited).toBe(1);
    expect(started.stderr.join('')).toMatch(/MATTER_SIDECAR_PORT.*Fix the MATTER_SIDECAR_\* environment variables/s);
    expect(started.stderr.join('')).not.toMatch(/\n\s+at /);
    expect(started.stdout.join('')).not.toContain('listening');
  });

  it('refuses to start without a service token, naming the variable, and ends only itself', async () => {
    const started = start({ MATTER_SIDECAR_PORT: '0' }, cwd);
    children.push(started.child);
    expect(await started.exited).toBe(1);
    expect(started.stderr.join('')).toMatch(/MATTER_SIDECAR_AUTH_TOKEN: a service token is required/);
    expect(started.stdout.join('')).not.toContain('listening');
  });

  it('refuses a remote bind that has neither TLS nor the explicit insecure flag', async () => {
    const started = launch({ MATTER_SIDECAR_PORT: '0', MATTER_SIDECAR_BIND_HOST: '0.0.0.0' });
    expect(await started.exited).toBe(1);
    expect(started.stderr.join('')).toMatch(/MATTER_SIDECAR_ALLOWED_HOSTS.*MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true/s);
  });

  it('answers 401 without the token and keeps the probes anonymous', async () => {
    const started = launch();
    const port = await ready(started);
    expect((await http(port, 'GET', '/version')).status).toBe(401);
    expect((await http(port, 'GET', '/health/live')).status).toBe(200);
    expect(started.stdout.join('') + started.stderr.join('')).not.toContain(TOKEN);
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
