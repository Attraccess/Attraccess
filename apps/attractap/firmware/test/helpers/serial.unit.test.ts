import { expect, test } from 'vitest';
import { SerialDevice } from './serial';

test('failed bridge startup rejects open and cleanup finishes immediately', async () => {
  const previous = process.env.HIL_PYTHON;
  process.env.HIL_PYTHON = '/nonexistent/attractap-python';
  const device = new SerialDevice('/nonexistent/reader', '1234');
  try {
    await expect(device.open()).rejects.toThrow('ENOENT');
    await device.close();
  } finally {
    if (previous === undefined) delete process.env.HIL_PYTHON;
    else process.env.HIL_PYTHON = previous;
  }
});
test('rejects serial frames longer than the real firmware buffer', () => {
  const device = new SerialDevice('/nonexistent/reader', '1234');
  expect(() => device.sendSerialMessage('api.configuration.set', { hostname: 'a'.repeat(256) })).toThrow(
    '256-byte limit',
  );
});
