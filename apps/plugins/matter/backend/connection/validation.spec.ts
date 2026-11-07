import { selfSignedCertificate } from '../testing/certs';
import { isCertificateBundle, normalizeUrl, settingsSchema, validationMessages } from './validation';

const token = 'a'.repeat(32);

describe('normalizeUrl', () => {
  it.each([
    ['http://127.0.0.1:8581', 'http://127.0.0.1:8581'],
    ['https://matter.example.com/', 'https://matter.example.com'],
    ['https://host.example/prefix/', 'https://host.example/prefix'],
    ['https://host.example/a/b', 'https://host.example/a/b'],
  ])('accepts %s', (input, expected) => expect(normalizeUrl(input)).toBe(expected));

  it.each([
    'ftp://host.example',
    'ws://host.example',
    'not a url',
    'https://user:pass@host.example',
    'https://host.example/?x=1',
    'https://host.example/#frag',
    'https://host.example?',
    `https://host.example/${'a'.repeat(2048)}`,
    '',
  ])('rejects %j', (input) => expect(normalizeUrl(input)).toBeNull());
});

describe('isCertificateBundle', () => {
  it('accepts one or several PEM certificates', async () => {
    const one = (await selfSignedCertificate()).cert;
    const two = (await selfSignedCertificate('other')).cert;
    expect(isCertificateBundle(one)).toBe(true);
    expect(isCertificateBundle(`${one}\n${two}`)).toBe(true);
  });

  it('rejects anything else, including a private key and oversized input', async () => {
    const { cert, key } = await selfSignedCertificate();
    expect(isCertificateBundle('')).toBe(false);
    expect(isCertificateBundle('garbage')).toBe(false);
    expect(isCertificateBundle(key)).toBe(false);
    expect(isCertificateBundle(`${cert}\ntrailing text`)).toBe(false);
    expect(isCertificateBundle('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')).toBe(false);
    expect(isCertificateBundle(cert + ' '.repeat(65 * 1024))).toBe(false);
  });
});

describe('settingsSchema', () => {
  it('accepts a URL alone, and optional credential and CA (null clears it)', () => {
    expect(settingsSchema.safeParse({ url: ' https://host.example/p ' }).success).toBe(true);
    expect(
      settingsSchema.safeParse({ url: 'http://127.0.0.1:8581', credential: token, caCertificate: null }).success,
    ).toBe(true);
  });

  it.each([
    [{}, 'url'],
    [{ url: 'ftp://x' }, 'url'],
    [{ url: 'https://h.example', credential: 'short' }, 'credential'],
    [{ url: 'https://h.example', credential: `${'a'.repeat(31)} ` }, 'credential'],
    [{ url: 'https://h.example', credential: 'a'.repeat(513) }, 'credential'],
    [{ url: 'https://h.example', caCertificate: 'nope' }, 'caCertificate'],
    [{ url: 'https://h.example', extra: true }, 'body'],
  ])('rejects %j', (input, path) => {
    const result = settingsSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(validationMessages(result.error).join()).toContain(path);
  });

  it('never echoes a rejected credential in its messages', () => {
    const result = settingsSchema.safeParse({ url: 'https://h.example', credential: 'secret value' });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(validationMessages(result.error))).not.toContain('secret value');
  });
});
