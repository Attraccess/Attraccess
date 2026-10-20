import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { withDesktopCleanup } from './desktop-simulator-cleanup';

it.each([false, true])(
  'removes storage after database cleanup fails, preserving work failure=%s',
  async (workFails) => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-cleanup-test-'));
    const original = new Error('scenario failed');
    const database = new Error('database close failed');
    try {
      await expect(
        withDesktopCleanup(
          async () => {
            if (workFails) throw original;
          },
          async () => {
            throw database;
          },
          () => rmSync(root, { recursive: true, force: true }),
        ),
      ).rejects.toBe(workFails ? original : database);
      expect(existsSync(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
