import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../settings/settings.service';
import { ApprovedOriginsService, originOfUrl, parseTrustedOrigins } from './approved-origins.service';

const build = (
  config: Record<string, string | undefined>,
  url: string | null = null,
  publicUrl: string | null = null,
) => {
  const settings = { getUrl: jest.fn(async () => url), getPublicInternetUrl: jest.fn(async () => publicUrl) };
  const service = new ApprovedOriginsService(
    { get: () => config } as unknown as ConfigService,
    settings as unknown as SettingsService,
  );
  return { service, settings };
};
const req = (protocol: string, host: string) => ({ protocol, get: () => host }) as never;

describe('ApprovedOriginsService', () => {
  it('reduces URLs to origins and rejects non-http values', () => {
    expect(originOfUrl('https://app.example/some/path?x=1')).toBe('https://app.example');
    expect(originOfUrl('ftp://app.example')).toBeNull();
    expect(originOfUrl('nope')).toBeNull();
    expect(originOfUrl(null)).toBeNull();
  });

  it('keeps exact origins and reports wildcards, paths and garbage', () => {
    const invalid: string[] = [];
    const origins = parseTrustedOrigins(
      'https://a.example, https://*.example, https://b.example/path, nonsense, ,http://c.example:8080/',
      (entry) => invalid.push(entry),
    );
    expect(origins).toEqual(['https://a.example', 'http://c.example:8080']);
    expect(invalid).toEqual(['https://*.example', 'https://b.example/path', 'nonsense']);
  });

  it('approves env origins, the trusted list, the served origin and the Settings URLs', async () => {
    const { service } = build(
      {
        ATTRACCESS_URL: 'https://url.example',
        ATTRACCESS_FRONTEND_URL: 'https://frontend.example',
        ATTRACCESS_PUBLIC_INTERNET_URL: 'https://public.example',
        ATTRACCESS_TRUSTED_ORIGINS: 'https://extra.example',
      },
      'https://settings.example/app',
      'https://settings-public.example',
    );
    for (const origin of [
      'https://url.example',
      'https://frontend.example',
      'https://public.example',
      'https://extra.example',
      'https://settings.example',
      'https://settings-public.example',
    ])
      expect(await service.isApproved(origin)).toBe(true);
    expect(await service.isApproved('https://served.example', req('https', 'served.example'))).toBe(true);
  });

  it('rejects sibling hosts, other schemes and ports, "null" and missing origins', async () => {
    const { service } = build({ ATTRACCESS_URL: 'https://attraccess.customer.com' });
    for (const origin of [
      'https://help.customer.com',
      'http://attraccess.customer.com',
      'https://attraccess.customer.com:8443',
      'null',
      undefined,
    ])
      expect(await service.isApproved(origin, req('https', 'attraccess.customer.com'))).toBe(false);
  });

  it('uses X-Forwarded-Host, with its port, only when the connecting hop is a trusted proxy', async () => {
    const { service } = build({});
    const proxied = (trusted: boolean) =>
      ({
        protocol: 'https',
        get: (name: string) => ({ host: 'localhost:3000', 'x-forwarded-host': 'app.example.com:8443, other' })[name],
        app: { get: () => () => trusted },
        socket: { remoteAddress: '10.0.0.2' },
      }) as never;
    expect(await service.isApproved('https://app.example.com:8443', proxied(true))).toBe(true);
    expect(await service.isApproved('https://localhost:3000', proxied(true))).toBe(false);
    expect(await service.isApproved('https://app.example.com:8443', proxied(false))).toBe(false);
    expect(await service.isApproved('https://localhost:3000', proxied(false))).toBe(true);
  });

  it('caches Settings URLs for a minute and fails closed when Settings cannot be read', async () => {
    const { service, settings } = build({}, 'https://settings.example');
    await service.isApproved('https://settings.example');
    await service.isApproved('https://other.example');
    expect(settings.getUrl).toHaveBeenCalledTimes(1);

    const broken = build({});
    broken.settings.getUrl.mockRejectedValue(new Error('db down'));
    expect(await broken.service.isApproved('https://settings.example')).toBe(false);
  });
});
