import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApprovedOriginsService } from './approved-origins.service';
import { AllowCrossSiteWrite, CrossSiteWriteGuard } from './cross-site-write.guard';

class Routes {
  normal() {
    return undefined;
  }
  @AllowCrossSiteWrite()
  exempt() {
    return undefined;
  }
}

@AllowCrossSiteWrite()
class ExemptRoutes {
  callback() {
    return undefined;
  }
}

const approved = new Set(['https://app.example']);
const approvedOrigins = {
  isApproved: jest.fn(async (origin?: string, _request?: unknown) => Boolean(origin && approved.has(origin))),
  servedOrigin: jest.fn(() => 'https://app.example'),
};
const guard = new CrossSiteWriteGuard(new Reflector(), approvedOrigins as unknown as ApprovedOriginsService);

type FakeRequest = { method?: string; headers?: Record<string, string>; cookies?: Record<string, string> };

const run = (request: FakeRequest, handler: () => unknown = Routes.prototype.normal, controller: object = Routes) =>
  guard.canActivate({
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', path: '/api/x', headers: {}, cookies: {}, ...request }),
    }),
  } as unknown as ExecutionContext);

const cookie = { 'auth-session': 'secret-session-value' };
const sibling = 'https://help.example';

describe('CrossSiteWriteGuard', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each(['GET', 'HEAD', 'OPTIONS'])('never blocks %s', async (method) => {
    await expect(run({ method, headers: { origin: 'https://evil.example' }, cookies: cookie })).resolves.toBe(true);
  });

  it('allows cookie writes from an approved origin and checks it against the request', async () => {
    await expect(run({ headers: { origin: 'https://app.example' }, cookies: cookie })).resolves.toBe(true);
    expect(approvedOrigins.isApproved).toHaveBeenCalledWith(
      'https://app.example',
      expect.objectContaining({ method: 'POST', path: '/api/x' }),
    );
  });

  it.each([sibling, 'null'])('refuses cookie writes from origin %s', async (origin) => {
    await expect(run({ headers: { origin }, cookies: cookie })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses sign-in style writes from an unapproved origin even without a cookie (login CSRF)', async () => {
    await expect(run({ headers: { origin: sibling } })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses writes the browser marks cross-site when no Origin is sent', async () => {
    await expect(run({ headers: { 'sec-fetch-site': 'cross-site' } })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a cookie write with no Origin', async () => {
    await expect(run({ cookies: cookie })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows curl-style sign-in with no browser headers', async () => {
    await expect(run({})).resolves.toBe(true);
  });

  it('does not affect bearer tokens, with or without an Origin', async () => {
    await expect(run({ headers: { authorization: 'Bearer t', origin: sibling } })).resolves.toBe(true);
    await expect(run({ headers: { authorization: 'Bearer t' }, cookies: cookie })).resolves.toBe(true);
    expect(approvedOrigins.isApproved).not.toHaveBeenCalled();
  });

  it.each([
    ['a Basic header the browser adds by itself', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['a Negotiate header', { authorization: 'Negotiate abc' }],
    ['an empty Bearer header', { authorization: 'Bearer   ' }],
    ['an x-api-key header', { 'x-api-key': 'k' }],
  ])('still checks cookie writes that carry %s', async (_label, headers) => {
    await expect(run({ headers: { ...headers, origin: sibling }, cookies: cookie })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run({ headers, cookies: cookie })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets exempt routes through from any site', async () => {
    await expect(
      run(
        { headers: { origin: 'https://idp.example', 'sec-fetch-site': 'cross-site' }, cookies: cookie },
        Routes.prototype.exempt,
      ),
    ).resolves.toBe(true);
  });

  it('honours the exemption on a whole controller', async () => {
    await expect(
      run(
        { headers: { origin: 'https://idp.example', 'sec-fetch-site': 'cross-site' }, cookies: cookie },
        ExemptRoutes.prototype.callback,
        ExemptRoutes,
      ),
    ).resolves.toBe(true);
  });

  it('logs refusals without cookie or token values and caps the logged origin', async () => {
    const longOrigin = `https://${'a'.repeat(5000)}.example`;
    await expect(
      run({ headers: { origin: longOrigin, authorization: 'Basic c2VjcmV0LWJhc2lj' }, cookies: cookie }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('origin_not_approved');
    expect(line).toContain('served-as=https://app.example');
    expect(line).not.toContain('secret-session-value');
    expect(line).not.toContain('c2VjcmV0LWJhc2lj');
    expect(line.length).toBeLessThan(1000);
  });

  it('ignores non-http contexts', async () => {
    await expect(guard.canActivate({ getType: () => 'ws' } as unknown as ExecutionContext)).resolves.toBe(true);
  });
});
