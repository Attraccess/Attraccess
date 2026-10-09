import * as files from 'node:fs/promises';
import { WriteAdmissionError } from '../runtime/types';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cc100OnboardIoAdapter } from './adapters';

import { point, deferred } from './onboard-io.test-utils';
jest.mock('node:fs/promises', () => ({ __esModule: true, ...jest.requireActual('node:fs/promises') }));
describe('packed output admission', () => {
  it('checks expiry after the physical register read and before changing any bits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cc100-admission-'));
    const output = join(directory, 'dout');
    const release = deferred();
    const entered = deferred();
    const originalRead = files.readFile;
    let expired = false;
    try {
      await writeFile(output, '8');
      jest.spyOn(files, 'readFile').mockImplementation(async (...args: Parameters<typeof files.readFile>) => {
        const value = await originalRead(...args);
        if (args[0] === output) {
          entered.resolve();
          await release.promise;
        }
        return value;
      });
      const adapter = new Cc100OnboardIoAdapter({ input: join(directory, 'din'), output });
      const writing = adapter.write(point(0), true, () => {
        if (expired) throw new WriteAdmissionError('expired');
      });
      const rejected = expect(writing).rejects.toMatchObject({ code: 'expired' });
      await entered.promise;
      expired = true;
      release.resolve();
      await rejected;
      expect(await originalRead(output, 'utf8')).toBe('8');
    } finally {
      release.resolve();
      jest.restoreAllMocks();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
