import { ChildProcess, execFileSync, spawn } from 'child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { DesktopDiagnostics } from './desktop-simulator-diagnostics';
import { withDesktopCleanup } from './desktop-simulator-cleanup';

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
  devicePin: string;
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
  readonly diagnostics = new DesktopDiagnostics();

  constructor(
    private readonly endpoint: string,
    scenario: string,
    /** Approves the code a new reader shows, through the API. Only needed while the profile is empty. */
    private readonly approve?: (code: string) => Promise<void>,
  ) {
    if (!/^[a-z0-9-]+$/.test(scenario)) throw new Error('Invalid scenario name');
    this.diagnostics.remember(process.env.AUTH_SESSION_SECRET);
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
        env: { ...process.env, SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software', SDL_AUDIO_DRIVER: 'dummy' },
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
      let approvedCode = '';
      await waitFor(
        async () => {
          if (spawnError) throw spawnError;
          this.assertRunning();
          const pending = join(this.control, 'pending-approval');
          if (this.approve && existsSync(pending)) {
            const code = readFileSync(pending, 'utf8').trim();
            // Codes rotate; each one is tried once and the next rotation retries.
            if (code && code !== approvedCode) {
              approvedCode = code;
              await this.approve(code);
            }
          }
          return existsSync(join(this.control, 'ready'));
        },
        'reader authentication',
        // Approval adds a code round trip through the API; without it the original startup bound applies.
        this.approve ? 60_000 : undefined,
      );
    } catch (error) {
      await withDesktopCleanup(
        async () => {
          throw error;
        },
        () => this.dispose(),
      );
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
    writeFileSync(temporary, request, { mode: 0o600, flag: 'wx' });
    this.assertPrivateFile(temporary);
    renameSync(temporary, join(this.control, `${sequence}.json`));
    const response = join(this.control, `${sequence}.result.json`);
    await waitFor(() => {
      this.assertRunning();
      return existsSync(response);
    }, this.diagnostics.sanitize(description));
    this.assertPrivateFile(response);
    // ProfileStore already writes credentials privately; verify that boundary too.
    const profile = join(this.root, 'profile');
    const credentials = readdirSync(profile).filter((name) => name.endsWith('.profile'));
    if (!credentials.length) throw new Error('Desktop credential profile is missing');
    for (const name of credentials) this.assertPrivateFile(join(profile, name));
    const result: ProbeResult = JSON.parse(readFileSync(response, 'utf8'));
    this.diagnostics.remember(result.devicePin);
    appendFileSync(
      join(this.screenshots, 'observations.ndjson'),
      // Persist only diagnostic fields; credentials remain in the in-memory result.
      JSON.stringify({
        launch: this.launch,
        sequence,
        description: this.diagnostics.sanitize(description),
        readerId: result.readerId,
        authenticationGeneration: result.authenticationGeneration,
        authenticated: result.authenticated,
        networkAvailable: result.networkAvailable,
        screen: this.diagnostics.sanitize(result.screen),
        removedOnWrite: result.removedOnWrite,
        ok: result.ok,
        labels: result.labels.map((label) => this.diagnostics.sanitize(label)),
        keyVersions: result.keyVersions,
      }) + '\n',
    );
    if (requireSuccess && !result.ok)
      throw new Error(
        this.diagnostics.sanitize(
          `Desktop command ${description} failed. Visible labels: ${JSON.stringify(result.labels)}`,
        ),
      );
    return result;
  }

  private assertPrivateFile(file: string) {
    if ((statSync(file).mode & 0o777) !== 0o600)
      throw new Error('Desktop credential file must have owner-only read/write permissions');
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
      JSON.stringify({
        readerId,
        connectionId: this.diagnostics.sanitize(connectionId),
        messageType: this.diagnostics.sanitize(messageType),
        acknowledged,
      }) + '\n',
    );
  }

  async snapshot(name: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name)) throw new Error('Invalid screenshot name');
    const observed = await this.command('inspect');
    this.diagnostics.assertScreenshotSafe(observed.screen, observed.labels);
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
    this.simulator = undefined;
    writeFileSync(join(this.screenshots, `launch-${this.launch}.log`), this.diagnostics.sanitize(this.output));
  }

  async dispose() {
    try {
      await this.stop();
    } finally {
      rmSync(this.root, { recursive: true, force: true });
    }
  }
}
