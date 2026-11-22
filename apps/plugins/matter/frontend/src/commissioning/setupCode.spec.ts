import { describe, expect, it } from 'vitest';
import { MANUAL_11, MANUAL_21, QR_PAYLOAD, qrPixels } from '../test-utils/qrPixels';
import { decodeQrFromPixels, setupCodeFromScan } from './qrDecode';
import { parseSetupCode, verhoeffValid } from './setupCode';

describe('setup code validation', () => {
  it('accepts the specification examples (11 and 21 digits) with spaces and hyphens', () => {
    expect(parseSetupCode(MANUAL_11)).toEqual({ ok: true, code: MANUAL_11 });
    expect(parseSetupCode('3497 011-2332')).toEqual({ ok: true, code: MANUAL_11 });
    expect(parseSetupCode(` ${MANUAL_21} `)).toEqual({ ok: true, code: MANUAL_21 });
  });

  it('rejects a wrong check digit, a wrong length and non-digits', () => {
    expect(parseSetupCode('34970112333')).toEqual({ ok: false, problem: 'checksum' });
    expect(parseSetupCode('749701123365521327695')).toEqual({ ok: false, problem: 'checksum' });
    expect(parseSetupCode('3497011233')).toEqual({ ok: false, problem: 'format' });
    expect(parseSetupCode('3497011233a')).toEqual({ ok: false, problem: 'format' });
    expect(parseSetupCode('   ')).toEqual({ ok: false, problem: 'empty' });
  });

  it('accepts a QR payload and rejects text that is not base38', () => {
    expect(parseSetupCode(QR_PAYLOAD)).toEqual({ ok: true, code: QR_PAYLOAD });
    expect(parseSetupCode(' mt:y.k9042c00ka0648g00 ')).toEqual({ ok: true, code: QR_PAYLOAD });
    expect(parseSetupCode('MT:short')).toEqual({ ok: false, problem: 'format' });
    expect(parseSetupCode('MT:Y.K9042C00KA064_G00')).toEqual({ ok: false, problem: 'format' });
  });

  it('rejects a pasted payload that is far longer than any QR code', () => {
    expect(parseSetupCode(`MT:${'A'.repeat(10_000)}`)).toEqual({ ok: false, problem: 'format' });
    expect(parseSetupCode(`MT:${'A'.repeat(512)}`).ok).toBe(true);
    expect(parseSetupCode(`MT:${'A'.repeat(513)}`).ok).toBe(false);
  });

  it('computes Verhoeff for known vectors', () => {
    expect(verhoeffValid('2363')).toBe(true);
    expect(verhoeffValid('2364')).toBe(false);
  });
});

describe('QR decoding', () => {
  it('decodes a real QR image of a known payload, also scaled and inverted', async () => {
    await expect(decodeQrFromPixels(qrPixels(QR_PAYLOAD))).resolves.toBe(QR_PAYLOAD);
    await expect(decodeQrFromPixels(qrPixels(QR_PAYLOAD, 3, 6))).resolves.toBe(QR_PAYLOAD);
    const inverted = qrPixels(QR_PAYLOAD);
    for (let at = 0; at < inverted.data.length; at += 4) {
      inverted.data[at] = inverted.data[at + 1] = inverted.data[at + 2] = 255 - inverted.data[at];
    }
    await expect(decodeQrFromPixels(inverted)).resolves.toBe(QR_PAYLOAD);
    // Camera frames are tried the normal way only, which is cheaper: an inverted code is not found there.
    await expect(decodeQrFromPixels(qrPixels(QR_PAYLOAD), 'normal')).resolves.toBe(QR_PAYLOAD);
    await expect(decodeQrFromPixels(inverted, 'normal')).resolves.toBeNull();
  });

  it('finds nothing in a blank picture and keeps only the payload of a longer text', async () => {
    const blank = { data: new Uint8ClampedArray(40 * 40 * 4).fill(255), width: 40, height: 40 };
    await expect(decodeQrFromPixels(blank)).resolves.toBeNull();
    expect(setupCodeFromScan(`see ${QR_PAYLOAD} now`)).toBe(QR_PAYLOAD);
    expect(setupCodeFromScan(' 3497 ')).toBe('3497');
  });
});
