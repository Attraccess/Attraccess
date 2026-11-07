import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AttractapFirmwareService } from './firmware.service';

describe('AttractapFirmwareService secure images', () => {
  const dir = mkdtempSync(join(tmpdir(), 'firmwares-'));
  const previous = { assets: process.env.ATTRACTAP_FIRMWARE_ASSETS_DIR, storage: process.env.STORAGE_ROOT };
  let service: AttractapFirmwareService;

  beforeAll(() => {
    process.env.ATTRACTAP_FIRMWARE_ASSETS_DIR = dir;
    process.env.STORAGE_ROOT = join(dir, 'storage');
    for (const file of ['plain.bin', 'plain_ota.bin', 'secure_app.bin', 'secure_bootloader.bin']) {
      writeFileSync(join(dir, file), file);
    }
    const entry = (variant: string, secureImage?: object) => ({
      name: 'attractap',
      variant,
      filename: 'plain.bin',
      filenameOTA: 'plain_ota.bin',
      version: '1',
      secureImage,
    });
    writeFileSync(
      join(dir, 'firmwares.json'),
      JSON.stringify({
        firmwares: [
          entry('wifi', { appFilename: 'secure_app.bin', bootloaderFilename: 'secure_bootloader.bin' }),
          entry('eth'),
          entry('missing', { appFilename: 'gone.bin', bootloaderFilename: 'gone2.bin' }),
        ],
      }),
    );
    service = new AttractapFirmwareService();
  });
  afterAll(() => {
    for (const [key, value] of [
      ['ATTRACTAP_FIRMWARE_ASSETS_DIR', previous.assets],
      ['STORAGE_ROOT', previous.storage],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves plain readers only the plain OTA image, never the secure ones', () => {
    expect(service.getOtaFile('attractap', 'wifi').filename).toBe('plain_ota.bin');
    expect(service.getFirmwareBinarySize('attractap', 'wifi')).toBe('plain.bin'.length);
  });

  it('exposes secure images only through the dedicated lookup, and only when both files exist', () => {
    expect(service.getSecureImageSource('attractap', 'wifi')?.appPath).toBe(join(dir, 'secure_app.bin'));
    expect(service.getSecureImageSource('attractap', 'eth')).toBeUndefined();
    expect(service.getSecureImageSource('attractap', 'missing')).toBeUndefined();
  });
});
