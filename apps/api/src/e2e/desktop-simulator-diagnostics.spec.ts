import { ChildProcess, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PassThrough } from 'stream';
import { DesktopFixture, ProbeResult } from './desktop-simulator.fixture';
import { DesktopDiagnostics } from './desktop-simulator-diagnostics';

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }));

it('excludes injected secrets from every retained text channel without changing control results', async () => {
  const pin = '8642';
  const credential = 'opaque-short-value';
  const key = 'aabbccddeeff00112233445566778899';
  const sensitive = [`PIN: ${pin}`, 'passcode=hidden', 'password=hidden', 'token=hidden', credential, key];
  const child = new ChildProcess();
  const stdout = new PassThrough();
  Object.defineProperty(child, 'stdout', { value: stdout });
  jest.spyOn(child, 'kill').mockImplementation(() => {
    child.emit('exit', 0);
    return true;
  });
  const result: ProbeResult = {
    devicePin: pin,
    readerId: 1,
    authenticationGeneration: 1,
    authenticated: true,
    networkAvailable: true,
    screen: 'locked',
    removedOnWrite: false,
    ok: true,
    labels: ['Reader connected', ...sensitive],
    keyVersions: [0, 1],
  };
  jest.mocked(spawn).mockImplementation((_command, args) => {
    const [, control, profile] = args as string[];
    mkdirSync(profile);
    writeFileSync(join(profile, 'reader.profile'), credential, { mode: 0o600 });
    writeFileSync(join(control, 'ready'), 'ready');
    for (const sequence of [1, 2])
      writeFileSync(join(control, `${sequence}.result.json`), JSON.stringify(result), { mode: 0o600 });
    return child;
  });
  const fixture = new DesktopFixture('http://127.0.0.1:1', 'diagnostic-injection');
  fixture.diagnostics.remember(credential);
  try {
    await fixture.start();
    stdout.emit('data', Buffer.from(['Reader connected', ...sensitive].join('\n')));
    const observed = await fixture.exchange('{"action":"inspect"}', sensitive.join('\n'), true);
    expect(observed).toEqual(result);
    fixture.recordDelivery(1, credential, sensitive.join('\n'), true);
    await expect(fixture.snapshot('sensitive')).rejects.toThrow('potentially sensitive');
    expect(readdirSync(fixture.screenshots).some((file) => file.endsWith('.png'))).toBe(false);
    await fixture.stop();
    const files = readdirSync(fixture.screenshots);
    expect(files.sort()).toEqual(['deliveries.ndjson', 'launch-1.log', 'observations.ndjson', 'revision.txt']);
    for (const file of files) {
      const text = readFileSync(join(fixture.screenshots, file), 'utf8');
      if (file === 'revision.txt') {
        // Hashes may coincidentally contain PIN digits; this channel accepts only Git/digest metadata.
        expect(text).toMatch(/^[a-f0-9]{40}\nworking-tree-sha256 [a-f0-9]{64}\n$/);
        continue;
      }
      for (const secret of [pin, credential, key, 'hidden']) expect(text).not.toContain(secret);
    }
    expect(readFileSync(join(fixture.screenshots, 'launch-1.log'), 'utf8')).toContain('Reader connected');
    const observation = JSON.parse(
      readFileSync(join(fixture.screenshots, 'observations.ndjson'), 'utf8').split('\n')[0],
    );
    expect(observation).not.toHaveProperty('devicePin');
    expect(observation.labels).toContain('Reader connected');
  } finally {
    await fixture.dispose();
    rmSync(fixture.screenshots, { recursive: true, force: true });
    jest.restoreAllMocks();
  }
});

it.each(['settings', 'pin', 'credentials'])('refuses a %s screenshot even without sensitive labels', (screen) => {
  expect(() => new DesktopDiagnostics().assertScreenshotSafe(screen, ['Continue'])).toThrow('potentially sensitive');
});

it('allows the display date while excluding a known bare PIN', () => {
  const diagnostics = new DesktopDiagnostics();
  diagnostics.remember('8642');
  expect(() => diagnostics.assertScreenshotSafe('resources', ['18. Oktober 2026'])).not.toThrow();
  expect(() => diagnostics.assertScreenshotSafe('locked', ['8642'])).toThrow('potentially sensitive');
});

it('preserves a probe startup error and removes owned storage when diagnostic retention fails', async () => {
  const original = new Error('probe spawn failed');
  const child = new ChildProcess();
  const kill = jest.spyOn(child, 'kill').mockReturnValue(true);
  jest.mocked(spawn).mockImplementation(() => {
    process.nextTick(() => child.emit('error', original));
    return child;
  });
  const fixture = new DesktopFixture('invalid-endpoint', 'startup-cleanup-failure');
  // Make diagnostic writes fail independently of the original spawn error.
  rmSync(fixture.screenshots, { recursive: true, force: true });
  try {
    await expect(fixture.start()).rejects.toBe(original);
    expect(existsSync(fixture.root)).toBe(false);
    expect(kill).toHaveBeenCalledTimes(1);
    // A second stop does not retain stale child ownership after a write failure.
    await expect(fixture.stop()).rejects.toThrow();
    expect(kill).toHaveBeenCalledTimes(1);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    jest.restoreAllMocks();
  }
});
