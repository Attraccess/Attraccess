import { readFileSync } from 'fs';
import { join } from 'path';
import { checkEfuseReport, parseEfuseReport, SECURE_VERSION_FLOOR, type EfuseReport } from './efuse-report';
import { DIGEST0, DIGEST1, releaseReport } from './testing/efuse-report.test-fixture';

const recorded = { digest0: DIGEST0, digest1: DIGEST1 };
const withKey = (index: number, change: Partial<EfuseReport['keys'][number]>): EfuseReport => {
  const report = releaseReport();
  report.keys = report.keys.map((k, i) => (i === index ? { ...k, ...change } : k));
  return report;
};

describe('eFuse report check', () => {
  it('matches the release secure profile', () => {
    expect(checkEfuseReport(releaseReport(), recorded)).toEqual([]);
  });

  it.each<[string, EfuseReport, string]>([
    ['secure boot off', releaseReport({ secureBootEn: false }), 'secure-boot-disabled'],
    ['KEY0 purpose', withKey(0, { purpose: 'USER' }), 'key0-purpose'],
    ['KEY1 purpose', withKey(1, { purpose: 'USER' }), 'key1-purpose'],
    ['digest0 differs', releaseReport({ digest0: DIGEST1 }), 'digest0-mismatch'],
    ['digest0 missing', releaseReport({ digest0: null }), 'digest0-mismatch'],
    ['digest1 differs', releaseReport({ digest1: DIGEST0 }), 'digest1-mismatch'],
    ['KEY0 revoked', releaseReport({ revoke: [true, false, true] }), 'signing-key-revoked'],
    ['KEY1 revoked', releaseReport({ revoke: [false, true, true] }), 'signing-key-revoked'],
    ['slot 2 not revoked', releaseReport({ revoke: [false, false, false] }), 'slot2-not-revoked'],
    [
      'flash encryption off',
      releaseReport({ cryptCnt: 0, flashEncryptionMode: 'disabled' }),
      'flash-encryption-not-release',
    ],
    [
      'flash encryption in development mode',
      releaseReport({ cryptCnt: 1, flashEncryptionMode: 'development', cryptCntWriteProtected: false }),
      'flash-encryption-not-release',
    ],
    [
      'flash encryption counter not final',
      releaseReport({ cryptCnt: 1, cryptCntWriteProtected: false }),
      'flash-encryption-not-final',
    ],
    ['manual encrypt allowed', releaseReport({ disDownloadManualEncrypt: false }), 'manual-encrypt-enabled'],
    ['KEY2 purpose', withKey(2, { purpose: 'USER' }), 'key2-not-xts'],
    ['KEY2 unused', withKey(2, { used: false }), 'key2-not-xts'],
    ['KEY3 not DS', withKey(3, { purpose: 'HMAC_UP' }), 'key3-not-ds'],
    ['KEY3 unused', withKey(3, { used: false }), 'key3-not-ds'],
    ['KEY4 not HMAC_UP', withKey(4, { purpose: 'HMAC_DOWN_ALL' }), 'key4-not-nvs-hmac'],
    ['KEY2 readable', withKey(2, { readProtected: false }), 'rd-dis-incomplete'],
    ['KEY3 readable', withKey(3, { readProtected: false }), 'rd-dis-incomplete'],
    ['KEY4 readable', withKey(4, { readProtected: false }), 'rd-dis-incomplete'],
    ['RD_DIS misses KEY3', releaseReport({ rdDis: 0b0010100 }), 'rd-dis-incomplete'],
    ['RD_DIS writable', releaseReport({ rdDisWriteProtected: false }), 'rd-dis-writable'],
    ['pad JTAG on', releaseReport({ jtag: { padDisabled: false, usbDisabled: true, softDisJtag: 0 } }), 'jtag-enabled'],
    ['USB JTAG on', releaseReport({ jtag: { padDisabled: true, usbDisabled: false, softDisJtag: 0 } }), 'jtag-enabled'],
    [
      'ROM download open',
      releaseReport({
        download: {
          disDownloadMode: false,
          enableSecurityDownload: false,
          disForceDownload: false,
          disUsbSerialJtagDownload: true,
        },
      }),
      'rom-download-open',
    ],
    [
      'SECURE_VERSION below the floor',
      releaseReport({ secureVersion: SECURE_VERSION_FLOOR - 1 }),
      'secure-version-below-floor',
    ],
  ])('flags %s', (_name, report, code) => {
    expect(checkEfuseReport(report, recorded)).toEqual([code]);
  });

  it('flags digests the server never recorded for the reader, and compares them case-insensitively', () => {
    expect(checkEfuseReport(releaseReport(), { digest0: null, digest1: DIGEST1 })).toEqual(['digest0-not-recorded']);
    expect(checkEfuseReport(releaseReport(), { digest0: DIGEST0, digest1: null })).toEqual(['digest1-not-recorded']);
    expect(
      checkEfuseReport(releaseReport(), { digest0: DIGEST0.toUpperCase(), digest1: DIGEST1.toUpperCase() }),
    ).toEqual([]);
  });

  it('keeps the floor equal to the firmware file', () => {
    const file = join(__dirname, '../../../../attractap/firmware/secure-version-floor.txt');
    expect(SECURE_VERSION_FLOOR).toBe(Number(readFileSync(file, 'utf8').trim()));
  });
});

describe('eFuse report parsing', () => {
  const valid = JSON.parse(JSON.stringify(releaseReport())) as Record<string, unknown>;

  it('accepts a complete report and normalises the MAC', () => {
    expect(parseEfuseReport({ t: 'efuse.report', ...valid, mac: 'DC:B4:D9:21:71:C8' })).toEqual(releaseReport());
  });

  it.each([
    ['not an object', 'x'],
    ['no keys', { ...valid, keys: [] }],
    ['five keys', { ...valid, keys: (valid['keys'] as unknown[]).slice(0, 5) }],
    ['a bad MAC', { ...valid, mac: 'nope' }],
    ['a digest of the wrong length', { ...valid, digest0: 'abcd' }],
    ['a non-boolean flag', { ...valid, secureBootEn: 'yes' }],
    ['a huge counter', { ...valid, cryptCnt: 99 }],
    ['an unknown mode', { ...valid, flashEncryptionMode: 'weird' }],
    ['missing jtag', { ...valid, jtag: undefined }],
    ['a secure version out of range', { ...valid, secureVersion: 70000 }],
  ])('rejects %s', (_name, body) => {
    expect(parseEfuseReport(body)).toBeNull();
  });
});
