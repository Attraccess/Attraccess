import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { commissioningFixture } from './commissioning-fixture';

describe('mounted commissioning desktop/mobile acceptance through a real loopback API', () => {
  it('imports, selects, creates, recovers and navigates production panels', async () => {
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
        ],
        {
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: '1',
            WAGO_COMMISSIONING_FIXTURE_URL: fixture.url,
            WAGO_COMMISSIONING_FIXTURE_FILES: fixture.directory,
          },
          timeout: 180_000,
          maxBuffer: 1024 * 1024,
        },
      );
      process.stdout.write(child.stdout + child.stderr);
      expect(fixture.transport.copies.length).toBeGreaterThan(0);
      expect(fixture.processesSeen.every((command) => ['ssh-keyscan', 'ssh-keygen'].includes(command))).toBe(true);
    } finally {
      await fixture.close();
    }
  }, 200_000);
});
