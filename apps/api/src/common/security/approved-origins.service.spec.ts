import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express, Request } from 'express';
import request from 'supertest';
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
const req = (protocol: string, host: string | undefined) => ({ protocol, host }) as never;

// The Express that Nest serves requests with (v5), not the root package.
const nestExpress = (): (() => Express) =>
  require(require.resolve('express', { paths: [require.resolve('@nestjs/platform-express')] }));

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
    expect(await service.isApproved('http://localhost:4201', req('http', 'localhost:4201'))).toBe(true);
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

  it('has no served origin when the request has no host', () => {
    const { service } = build({});
    expect(service.servedOrigin(req('https', undefined))).toBeNull();
    expect(service.servedOrigin(req('https', 'app.example:443'))).toBe('https://app.example');
  });

  it('uses X-Forwarded-Host and -Proto, with the port, only when TRUST_PROXY trusts the hop', async () => {
    const { service } = build({});
    const servedVia = async (trustProxy: boolean | number) => {
      const app = nestExpress()();
      app.set('trust proxy', trustProxy);
      app.get('/', (r: Request, res) => res.send(service.servedOrigin(r)));
      const response = await request(app)
        .get('/')
        .set('Host', 'localhost:3000')
        .set('X-Forwarded-Host', 'app.example.com:8443, other')
        .set('X-Forwarded-Proto', 'https');
      return response.text;
    };
    expect(await servedVia(1)).toBe('https://app.example.com:8443');
    expect(await servedVia(false)).toBe('http://localhost:3000');
  });

  it('reads Settings URLs through on every check, so a changed URL applies on the next request', async () => {
    const { service, settings } = build({}, 'https://settings.example');
    expect(await service.isApproved('https://settings.example')).toBe(true);
    expect(await service.isApproved('https://other.example')).toBe(false);
    expect(settings.getUrl).toHaveBeenCalledTimes(2);

    settings.getUrl.mockResolvedValue('https://moved.example');
    expect(await service.isApproved('https://moved.example')).toBe(true);
    expect(await service.isApproved('https://settings.example')).toBe(false);
  });

  it('does not consult Settings for env-approved or served origins', async () => {
    const { service, settings } = build({ ATTRACCESS_URL: 'https://url.example' });
    await service.isApproved('https://url.example');
    await service.isApproved('https://served.example', req('https', 'served.example'));
    expect(settings.getUrl).not.toHaveBeenCalled();
  });

  it('fails closed for Settings URLs when Settings cannot be read', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, settings } = build({ ATTRACCESS_URL: 'https://url.example' }, 'https://settings.example');
    settings.getUrl.mockRejectedValue(new Error('db down'));
    expect(await service.isApproved('https://settings.example')).toBe(false);
    expect(await service.isApproved('https://url.example')).toBe(true);
    expect(logged).toHaveBeenCalledTimes(1);

    // Backs off instead of reading (and logging) on every request while Settings is down.
    settings.getUrl.mockClear();
    expect(await service.isApproved('https://settings.example')).toBe(false);
    expect(settings.getUrl).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();

    settings.getUrl.mockResolvedValue('https://settings.example');
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 5_001);
    expect(await service.isApproved('https://settings.example')).toBe(true);
    clock.mockRestore();
  });
});
