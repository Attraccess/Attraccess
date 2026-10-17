import { ChildProcess, execFileSync, spawn } from 'child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

export const repositoryRoot = resolve(__dirname, '../../../..');
export const buildDirectory = join(repositoryRoot, 'dist/apps/attractap-desktop');

export async function waitFor(condition: () => Promise<boolean> | boolean, description: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

/** Bound CMake's entire owned process group, including download/build children. */
export async function buildProbe() {
  for (const args of [
    ['-S', 'apps/attractap/desktop', '-B', buildDirectory],
    ['--build', buildDirectory, '--target', 'attractap-desktop-real-api', '--parallel', '2'],
  ]) {
    await new Promise<void>((resolveBuild, reject) => {
      const child = spawn('cmake', args, { cwd: repositoryRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const collect = (data: Buffer) => {
        output = (output + data.toString()).slice(-16_000);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      const timer = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          }
        }
      }, 180_000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolveBuild();
        else reject(new Error(`Native probe build failed (${code}): ${output}`));
      });
    });
  }
}

export interface ProbeResult {
  readerId: number;
  authenticationGeneration: number;
  authenticated: boolean;
  networkAvailable: boolean;
  screen: string;
  removedOnWrite: boolean;
  ok: boolean;
  labels: string[];
  keyVersions: number[];
}

/** Controls hardware seams and LVGL events; all API messages come from the production application. */
export class DesktopFixture {
  readonly root: string;
  private simulator?: ChildProcess;
  private exited?: Promise<void>;
  private sequence = 0;
  private launch = 0;
  private control = '';
  private output = '';
  private queue: Promise<unknown> = Promise.resolve();
  readonly screenshots: string;

  constructor(
    private readonly endpoint: string,
    scenario: string,
  ) {
    if (!/^[a-z0-9-]+$/.test(scenario)) throw new Error('Invalid scenario name');
    const artifacts = join(buildDirectory, 'real-api-artifacts');
    mkdirSync(artifacts, { recursive: true });
    this.screenshots = mkdtempSync(join(artifacts, `${scenario}-`));
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }).toString().trim();
    const changed = execFileSync('git', ['diff', '--name-only', '-z', 'HEAD'], { cwd: repositoryRoot });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: repositoryRoot,
    });
    const files = [...new Set(Buffer.concat([changed, untracked]).toString().split('\0').filter(Boolean))].sort();
    const digest = createHash('sha256');
    for (const file of files) {
      digest.update(file).update('\0');
      if (existsSync(join(repositoryRoot, file))) digest.update(readFileSync(join(repositoryRoot, file)));
      digest.update('\0');
    }
    writeFileSync(join(this.screenshots, 'revision.txt'), `${revision}\nworking-tree-sha256 ${digest.digest('hex')}\n`);
    this.root = mkdtempSync(join(tmpdir(), 'attractap-desktop-control-'));
  }

  async start() {
    if (this.simulator) throw new Error('Stop the owned probe before restarting');
    this.control = join(this.root, `launch-${++this.launch}`);
    mkdirSync(this.control);
    this.sequence = 0;
    this.output = '';
    const child = spawn(
      join(buildDirectory, 'attractap-desktop-real-api'),
      [this.endpoint, this.control, join(this.root, 'profile')],
      {
        cwd: repositoryRoot,
        env: { ...process.env, SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software' },
        stdio: 'pipe',
      },
    );
    this.simulator = child;
    child.stdout?.on('data', (data) => {
      this.output = (this.output + data.toString()).slice(-32_000);
    });
    child.stderr?.on('data', (data) => {
      this.output = (this.output + data.toString()).slice(-32_000);
    });
    let spawnError: Error | undefined;
    child.once('error', (error) => {
      spawnError = error;
    });
    this.exited = new Promise((resolveExit) => {
      child.once('exit', () => resolveExit());
      child.once('error', () => resolveExit());
    });
    try {
      await waitFor(() => {
        if (spawnError) throw spawnError;
        this.assertRunning();
        return existsSync(join(this.control, 'ready'));
      }, 'reader authentication');
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private assertRunning() {
    if (!this.simulator || this.simulator.exitCode !== null || this.simulator.signalCode !== null)
      throw new Error('Desktop probe stopped unexpectedly; see retained launch diagnostics');
  }

  command(action: string, args: Record<string, string | number | boolean> = {}): Promise<ProbeResult> {
    const description = ['click', 'wait-text', 'wait-screen', 'snapshot'].includes(action)
      ? `${action} ${args.text ?? ''}`
      : action;
    return this.exchange(JSON.stringify({ action, ...args }), description, true);
  }

  // Also used for malformed-input checks; failure responses are ordinary protocol results.
  exchange(request: string, description: string, requireSuccess = false): Promise<ProbeResult> {
    const pending = this.queue.then(() => this.send(request, description, requireSuccess));
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  private async send(request: string, description: string, requireSuccess: boolean): Promise<ProbeResult> {
    this.assertRunning();
    const sequence = ++this.sequence;
    const temporary = join(this.control, 'request.tmp');
    writeFileSync(temporary, request);
    renameSync(temporary, join(this.control, `${sequence}.json`));
    const response = join(this.control, `${sequence}.result.json`);
    await waitFor(() => {
      this.assertRunning();
      return existsSync(response);
    }, description);
    const result: ProbeResult = JSON.parse(readFileSync(response, 'utf8'));
    appendFileSync(
      join(this.screenshots, 'observations.ndjson'),
      JSON.stringify({ launch: this.launch, sequence, description, ...result }) + '\n',
    );
    if (requireSuccess && !result.ok)
      throw new Error(`Desktop command ${description} failed. Visible labels: ${JSON.stringify(result.labels)}`);
    return result;
  }

  text(text: string) {
    return this.command('wait-text', { text });
  }
  screen(text: string) {
    return this.command('wait-screen', { text });
  }
  click(text: string) {
    return this.command('click', { text });
  }
  present(card = 0) {
    return this.command('present', { card });
  }
  remove(card = 0) {
    return this.command('remove', { card });
  }

  recordDelivery(readerId: number, connectionId: string, messageType: string, acknowledged: boolean) {
    appendFileSync(
      join(this.screenshots, 'deliveries.ndjson'),
      JSON.stringify({ readerId, connectionId, messageType, acknowledged }) + '\n',
    );
  }

  async snapshot(name: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name)) throw new Error('Invalid screenshot name');
    await this.command('snapshot', { text: name });
    const file = join(this.control, 'screenshots', `${name}.png`);
    const png = readFileSync(file);
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error(`Invalid PNG screenshot: ${name}`);
    if (png.readUInt32BE(16) !== 480 || png.readUInt32BE(20) !== 480)
      throw new Error(`Unexpected LVGL screenshot dimensions: ${name}`);
    cpSync(file, join(this.screenshots, `${name}.png`));
  }

  async authenticationFailure(card = 0) {
    this.output = '';
    await this.present(card);
    await waitFor(() => {
      this.assertRunning();
      return this.output.includes('Authentication failed');
    }, 'local NFC authentication rejection');
    await this.screen('locked');
    const { labels } = await this.command('inspect');
    if (labels.includes('Ressource verwenden')) throw new Error('Wrong card key unlocked the reader');
  }

  async stop() {
    const child = this.simulator;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      await this.exited;
      clearTimeout(timer);
    }
    writeFileSync(
      join(this.screenshots, `launch-${this.launch}.log`),
      this.output
        .split('\n')
        .filter((line) => !/token|key|secret|authorization|payload|\{\s*"/i.test(line))
        .join('\n'),
    );
    this.simulator = undefined;
  }

  async dispose() {
    try {
      await this.stop();
    } finally {
      rmSync(this.root, { recursive: true, force: true });
    }
  }
}
