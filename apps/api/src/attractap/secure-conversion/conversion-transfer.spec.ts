import { SessionSecurityState } from '../security/session-security-state';
import { ADMIN, createConversionHarness } from './secure-conversion.test-fixture';
import { ConversionTransferService } from './conversion-transfer.service';
import { ConversionImages } from './conversion-images';

/** A conversion in `transferring` whose reader stalled after the first chunk request. */
async function transferring() {
  const h = createConversionHarness({ faults: { disconnectAfterChunks: 0 } });
  await h.connect();
  await h.service.start(1, 'Lab door', ADMIN);
  await h.pump();
  const conversion = h.conversions.rows[0];
  expect(conversion.state).toBe('transferring');
  const images = (h.service as unknown as { images: ConversionImages }).images;
  const transfer = new ConversionTransferService(h.conversions, images);
  return { h, conversion, transfer };
}

describe('conversion transfer', () => {
  it('serves 4 KiB chunks of the signed image and ignores a repeated offset on the same session', async () => {
    const { conversion, transfer } = await transferring();
    const state = new SessionSecurityState(1, 'f'.repeat(64));
    const request = { id: conversion.id, conversion: 'app', offset: 0, length: 65536 };
    expect((await transfer.chunk(state, request))?.length).toBe(4096);
    await expect(transfer.chunk(state, request)).resolves.toBeNull();
    // A new session may ask again from the staged offset.
    expect((await transfer.chunk(new SessionSecurityState(1, 'f'.repeat(64)), request))?.length).toBe(4096);
  });

  it.each([
    ['another conversion', { id: 99, conversion: 'app', offset: 0, length: 4096 }, 1],
    ['another reader', { id: 1, conversion: 'app', offset: 0, length: 4096 }, 2],
    ['an unknown image', { id: 1, conversion: 'partition-table', offset: 0, length: 4096 }, 1],
    ['a negative offset', { id: 1, conversion: 'app', offset: -1, length: 4096 }, 1],
    ['an offset past the end', { id: 1, conversion: 'bootloader', offset: 1 << 20, length: 4096 }, 1],
  ])('answers nothing for %s', async (_name, request, readerId) => {
    const { transfer } = await transferring();
    await expect(transfer.chunk(new SessionSecurityState(readerId, 'f'.repeat(64)), request)).resolves.toBeNull();
  });

  it('serves nothing once the conversion ended', async () => {
    const { h, conversion, transfer } = await transferring();
    await h.service.cancel(1);
    const request = { id: conversion.id, conversion: 'app', offset: 0, length: 4096 };
    await expect(transfer.chunk(new SessionSecurityState(1, 'f'.repeat(64)), request)).resolves.toBeNull();
  });
});
