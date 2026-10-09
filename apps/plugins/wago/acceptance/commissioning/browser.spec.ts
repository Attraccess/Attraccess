import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { commissioningFixture } from './fixture';

describe('mounted commissioning desktop/mobile acceptance through a real loopback API', () => {
  async function runBrowser(filter: string) {
    const fixture = await commissioningFixture();
    try {
      const child = await promisify(execFile)(
        process.env.PYTHON || 'python3',
        [
          '-m',
          'unittest',
          'discover',
          '-s',
          'apps/plugins/wago/frontend/tests',
          '-p',
          'test_commissioning_browser.py',
          '-v',
          '-k',
          filter,
        ],
        {
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: '1',
            WAGO_COMMISSIONING_FIXTURE_URL: fixture.url,
          },
          timeout: 180_000,
          maxBuffer: 1024 * 1024,
        },
      );
      process.stdout.write(child.stdout + child.stderr);
      if (filter.includes('recovery')) expect(fixture.transport.copies.length).toBeGreaterThan(0);
      expect(fixture.processesSeen.every((command) => ['ssh-keyscan', 'ssh-keygen'].includes(command))).toBe(true);
    } finally {
      await fixture.close();
    }
  }
  it(
    'checks bundled runtime availability on desktop and mobile',
    () => runBrowser('bundled_runtime_availability'),
    200_000,
  );
  it(
    'uses the bundled runtime, creates, recovers and navigates production panels',
    () => runBrowser('bundled_runtime_recovery'),
    200_000,
  );
});
