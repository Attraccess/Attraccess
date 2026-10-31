import { readFileSync } from 'fs';
import { join } from 'path';
import { commitment, commitmentMatches, deriveCode } from './pairing-protocol';

interface Vector {
  readerPublicKey: string;
  serverPublicKey: string;
  readerNonce: string;
  serverNonce: string;
  commitment: string;
  code: string;
  pattern: string[];
}

// The firmware host tests run the very same file, so both sides provably derive identical values.
const vectors = (
  JSON.parse(readFileSync(join(__dirname, '../../../../attractap/firmware/tests/pairing/vectors.json'), 'utf8')) as {
    vectors: Vector[];
  }
).vectors;

const bytes = (value: string) => Buffer.from(value, 'base64');

describe('pairing protocol shared vectors', () => {
  it.each(vectors.map((v, i) => [i, v] as const))('vector %i derives the same code, pattern and commitment', (_i, v) => {
    const derived = deriveCode(bytes(v.readerPublicKey), bytes(v.serverPublicKey), bytes(v.readerNonce), bytes(v.serverNonce));
    expect(derived.code).toBe(v.code);
    expect(derived.pattern).toEqual(v.pattern);
    const cs = commitment(bytes(v.serverPublicKey), bytes(v.readerPublicKey), bytes(v.serverNonce));
    expect(cs.toString('base64')).toBe(v.commitment);
  });

  it('fails the commitment check when anything was tampered with', () => {
    const v = vectors[0];
    const expected = bytes(v.commitment);
    const ps = bytes(v.serverPublicKey);
    const pr = bytes(v.readerPublicKey);
    const ns = bytes(v.serverNonce);
    expect(commitmentMatches(expected, ps, pr, ns)).toBe(true);
    expect(commitmentMatches(expected, ps, pr, Buffer.alloc(16, 1))).toBe(false);
    expect(commitmentMatches(expected, pr, ps, ns)).toBe(false);
    expect(commitmentMatches(expected.subarray(1), ps, pr, ns)).toBe(false);
  });

  it('derives a different code for a different reader key', () => {
    const v = vectors[0];
    const other = deriveCode(bytes(vectors[1].readerPublicKey), bytes(v.serverPublicKey), bytes(v.readerNonce), bytes(v.serverNonce));
    expect(other.code).not.toBe(v.code);
  });
});
