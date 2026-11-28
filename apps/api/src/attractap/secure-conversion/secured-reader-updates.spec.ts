import { ConflictException, NotFoundException } from '@nestjs/common';
import { FakeReaderStore, makeReader } from '../attractap-fake-stores.test-fixture';
import type { AttractapFirmwareService } from '../firmware.service';
import type { SecureImageService } from '../secure-boot/secure-image.service';
import { SecuredReaderUpdates } from './secured-reader-updates';

describe('SecuredReaderUpdates', () => {
  const image = { path: '/cache/app.signed.bin', size: 4096, keyDigest: 'k', secureVersion: 3, profileMarker: 'm' };
  let readers: FakeReaderStore;
  let getSignedImage: jest.Mock;
  let updates: SecuredReaderUpdates;

  beforeEach(() => {
    readers = new FakeReaderStore();
    getSignedImage = jest.fn(async () => image);
    const firmware = {
      getFirmwareDefinition: jest.fn(() => ({ version: '2.14.0', secureImage: {} })),
    } as unknown as AttractapFirmwareService;
    updates = new SecuredReaderUpdates(readers, firmware, { getSignedImage } as unknown as SecureImageService);
  });

  it('signs for the reader and never below the highest secureVersion known for it', async () => {
    const reader = readers.add(
      makeReader({ id: 5, secureBootDigest0: 'a'.repeat(64), efuseSecureVersion: 3, secureVersion: 2 }),
    );
    await expect(updates.prepare(5, 'attractap', 'touch-v2', 1)).resolves.toEqual({ image, version: '2.14.0' });
    expect(getSignedImage).toHaveBeenCalledWith(
      'attractap',
      'touch-v2',
      'app',
      expect.objectContaining({ id: reader.id }),
      3,
    );
  });

  it('offers nothing to a reader without recorded digests', async () => {
    readers.add(makeReader({ id: 6 }));
    await expect(updates.prepare(6, 'attractap', 'touch-v2', 1)).resolves.toBeNull();
    expect(getSignedImage).not.toHaveBeenCalled();
  });

  it.each([new NotFoundException('No signing key for this reader'), new ConflictException('anti-rollback')])(
    'offers nothing when signing is refused (%s)',
    async (error) => {
      readers.add(makeReader({ id: 7, secureBootDigest0: 'a'.repeat(64) }));
      getSignedImage.mockRejectedValue(error);
      await expect(updates.prepare(7, 'attractap', 'touch-v2', 1)).resolves.toBeNull();
    },
  );
});
