import { describe, expect, it } from 'vitest';
import { hasRequiredSamlSigningMaterial } from './signingMaterial';

describe('hasRequiredSamlSigningMaterial', () => {
  it('returns true when signing is disabled', () => {
    expect(
      hasRequiredSamlSigningMaterial({
        isSigningEnabled: false,
      }),
    ).toBe(true);
  });

  it('requires both certificate and key for a new provider', () => {
    expect(
      hasRequiredSamlSigningMaterial({
        isSigningEnabled: true,
      }),
    ).toBe(false);

    expect(
      hasRequiredSamlSigningMaterial({
        isSigningEnabled: true,
        inputCertificate: 'CERT',
      }),
    ).toBe(false);

    expect(
      hasRequiredSamlSigningMaterial({
        isSigningEnabled: true,
        inputCertificate: 'CERT',
        inputPrivateKey: 'KEY',
      }),
    ).toBe(true);
  });

  it('accepts stored signing materials when unchanged', () => {
    expect(
      hasRequiredSamlSigningMaterial({
        isSigningEnabled: true,
        storedCertificate: 'CERT',
        storedKey: 'enc:key',
        inputCertificate: 'CERT',
      }),
    ).toBe(true);
  });

  it('requires a new key when the certificate changes', () => {
    expect(
      hasRequiredSamlSigningMaterial({
        isSigningEnabled: true,
        storedCertificate: 'CERT',
        storedKey: 'enc:key',
        inputCertificate: 'NEWCERT',
      }),
    ).toBe(false);

    expect(
      hasRequiredSamlSigningMaterial({
        isSigningEnabled: true,
        storedCertificate: 'CERT',
        storedKey: 'enc:key',
        inputCertificate: 'NEWCERT',
        inputPrivateKey: 'NEWKEY',
      }),
    ).toBe(true);
  });
});


