import { parseConversionMessage } from './conversion-messages';
import { evaluatePreflight, preflightPassed } from './preflight';
import { EmulatedConversionDevice } from '../security/testing/emulated-conversion';

const HEX = 'ab'.repeat(32);
const preflightBody = () =>
  new EmulatedConversionDevice({ partitionTableSha256: HEX }).onControl({ t: 'conversion.preflight', id: 3 })
    .control[0];

describe('conversion message parsing', () => {
  it('accepts well-formed messages and normalises hex and MAC case', () => {
    expect(parseConversionMessage({ t: 'conversion.status', id: null, stage: 'none' })).toMatchObject({
      rdDisLocked: false,
    });
    expect(
      parseConversionMessage({
        t: 'conversion.burned',
        id: 2,
        mac: 'DC:B4:D9:21:71:C8',
        digest0: HEX.toUpperCase(),
        digest1: HEX,
        key0Purpose: 'SECURE_BOOT_DIGEST0',
        key1Purpose: 'SECURE_BOOT_DIGEST1',
      }),
    ).toMatchObject({ mac: 'dc:b4:d9:21:71:c8', digest0: HEX });
    expect(parseConversionMessage(preflightBody())).toMatchObject({ t: 'conversion.preflight-report', id: 3 });
  });

  it.each([
    { t: 'conversion.status', id: -1, stage: 'none' },
    { t: 'conversion.status', id: 1, stage: 'exploded' },
    { t: 'conversion.verified', id: 1, ok: true, problems: ['made-up'] },
    { t: 'conversion.burned', id: 1, mac: 'x', digest0: HEX, digest1: HEX, key0Purpose: 'a', key1Purpose: 'b' },
    { t: 'conversion.burn-refused', id: 1, reason: 'bored' },
    { t: 'conversion.bootloader-written', id: 1, ok: true, sha256: 'short' },
    { t: 'conversion.preflight-report', id: 1 },
    { t: 'conversion.unknown', id: 1 },
    [],
    'conversion.status',
  ])('rejects %j', (body) => {
    expect(parseConversionMessage(body)).toBeNull();
  });

  it('rejects a preflight report with a wrong number of key blocks', () => {
    const body = { ...preflightBody(), keys: [] };
    expect(parseConversionMessage(body)).toBeNull();
  });
});

describe('preflight evaluation', () => {
  const expected = { chip: 'esp32s3', variant: 'touch-v2', partitionTableSha256: HEX, digest0: HEX, digest1: HEX };
  const report = (patch: Record<string, unknown> = {}) => {
    const parsed = parseConversionMessage({ ...preflightBody(), ...patch });
    if (!parsed || parsed.t !== 'conversion.preflight-report') throw new Error('bad fixture');
    return parsed;
  };

  it('passes a plain, unburned 16 MB esp32s3', () => {
    const checks = evaluatePreflight(report(), expected);
    expect(preflightPassed(checks)).toBe(true);
    expect(checks.find((check) => check.check === 'chip')?.value).toBe('esp32s3 v0.2');
  });

  it.each<[string, Record<string, unknown>]>([
    ['chip', { chip: 'esp32c3' }],
    ['flash-size', { flashSize: 8 * 1024 * 1024 }],
    ['partition-table', { partitionTableSha256: 'cd'.repeat(32) }],
    ['secure-boot-off', { secureBootEn: true }],
    ['flash-encryption-off', { cryptCnt: 1 }],
    ['manual-encrypt', { disDownloadManualEncrypt: true }],
    ['heap', { heapLargest: 1000 }],
    ['variant', { variant: 'touch-v1' }],
    ['profile', { profile: 'secure' }],
  ])('fails %s', (check, patch) => {
    const failed = evaluatePreflight(report(patch), expected)
      .filter((c) => !c.ok)
      .map((c) => c.check);
    expect(failed).toEqual([check]);
  });

  it('fails used or protected key blocks, but accepts KEY0/KEY1 holding digests', () => {
    const keys = (report().keys as Array<Record<string, unknown>>).map((key) => ({ ...key }));
    keys[4] = { purpose: 'HMAC_UP', used: true, readProtected: true, writeProtected: false };
    expect(evaluatePreflight(report({ keys }), expected).find((c) => c.check === 'key-blocks')?.ok).toBe(false);
    keys[4] = { purpose: 'USER', used: false, readProtected: false, writeProtected: false };
    keys[0] = { purpose: 'SECURE_BOOT_DIGEST0', used: true, readProtected: false, writeProtected: true };
    keys[1] = { purpose: 'SECURE_BOOT_DIGEST1', used: true, readProtected: false, writeProtected: true };
    expect(evaluatePreflight(report({ keys }), expected).find((c) => c.check === 'key-blocks')?.ok).toBe(true);
  });
});
