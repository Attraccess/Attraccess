import { constants, createHash, generateKeyPairSync, sign } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildProofTuple, IDENTITY_UPGRADE_DOMAIN, verifyProof } from './identity-upgrade-proof';

/** The vector the firmware host test reads too: one byte-exact definition of the proof tuple. */
const VECTOR = JSON.parse(
  readFileSync(join(__dirname, '../../../../attractap/firmware/tests/identity-upgrade/proof-vector.json'), 'utf8'),
) as Record<string, string | number>;

const hex = (value: string | number) => Buffer.from(String(value), 'hex');

describe('identity upgrade proof tuple', () => {
  it('encodes the shared vector byte for byte', () => {
    const tuple = buildProofTuple({
      installationId: VECTOR['installationId'] as string,
      readerId: VECTOR['readerId'] as number,
      oldFingerprint: hex(VECTOR['oldFingerprintHex']),
      newSpki: hex(VECTOR['newSpkiHex']),
      nonce: hex(VECTOR['nonceHex']),
    });
    expect(tuple.toString('hex')).toBe(VECTOR['tupleHex']);
    expect(VECTOR['domain']).toBe(IDENTITY_UPGRADE_DOMAIN);
    expect(hex(VECTOR['oldFingerprintHex'])).toEqual(createHash('sha256').update('old-spki').digest());
  });

  it('length-prefixes every field so the boundary between two fields cannot move', () => {
    const base = {
      installationId: 'ab',
      readerId: 1,
      oldFingerprint: Buffer.alloc(32, 1),
      newSpki: Buffer.from('xyz'),
      nonce: Buffer.alloc(32, 2),
    };
    const moved = { ...base, installationId: 'a', readerId: 1 };
    expect(buildProofTuple(base).equals(buildProofTuple(moved))).toBe(false);
  });

  describe('signature', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 65537 });
    const spki = publicKey.export({ type: 'spki', format: 'der' });
    const tuple = Buffer.from('tuple');
    const pss = (saltLength: number, data = tuple) =>
      sign('sha256', data, { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength });

    it('accepts RSA-PSS SHA-256 with a 32 byte salt', () => {
      expect(verifyProof(spki, tuple, pss(32))).toBe(true);
    });

    it('rejects PKCS#1 v1.5, other salt lengths and other data', () => {
      expect(verifyProof(spki, tuple, sign('sha256', tuple, privateKey))).toBe(false);
      expect(verifyProof(spki, tuple, pss(20))).toBe(false);
      expect(verifyProof(spki, tuple, pss(0))).toBe(false);
      expect(verifyProof(spki, Buffer.from('other'), pss(32))).toBe(false);
      expect(verifyProof(spki, tuple, Buffer.alloc(384))).toBe(false);
      expect(verifyProof(Buffer.from('not a key'), tuple, pss(32))).toBe(false);
    });
  });
});
