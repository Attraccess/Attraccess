import { ExecutionContext, ForbiddenException } from '@nestjs/common';
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

const approved = new Set(['https://app.example']);
const guard = new CrossSiteWriteGuard(new Reflector(), {
  isApproved: async (origin?: string) => Boolean(origin && approved.has(origin)),
} as unknown as ApprovedOriginsService);

const run = (
  request: { method?: string; headers?: Record<string, string>; cookies?: Record<string, string> },
  handler: keyof Routes = 'normal',
) =>
  guard.canActivate({
    getType: () => 'http',
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', path: '/api/x', headers: {}, cookies: {}, ...request }),
    }),
  } as unknown as ExecutionContext);

const cookie = { 'auth-session': 'secret-session-value' };

describe('CrossSiteWriteGuard', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('never blocks %s', async (method) => {
    await expect(run({ method, headers: { origin: 'https://evil.example' }, cookies: cookie })).resolves.toBe(true);
  });

  it('allows cookie writes from an approved origin', async () => {
    await expect(run({ headers: { origin: 'https://app.example' }, cookies: cookie })).resolves.toBe(true);
  });

  it.each(['https://help.example', 'null'])('refuses cookie writes from origin %s', async (origin) => {
    await expect(run({ headers: { origin }, cookies: cookie })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses sign-in style writes from an unapproved origin even without a cookie (login CSRF)', async () => {
    await expect(run({ headers: { origin: 'https://help.example' } })).rejects.toBeInstanceOf(ForbiddenException);
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

  it('does not affect bearer tokens or API keys, even from another origin', async () => {
    await expect(run({ headers: { authorization: 'Bearer t', origin: 'https://help.example' } })).resolves.toBe(true);
    await expect(run({ headers: { 'x-api-key': 'k' }, cookies: cookie })).resolves.toBe(true);
  });

  it('lets exempt routes through from any site', async () => {
    await expect(
      run({ headers: { origin: 'https://idp.example', 'sec-fetch-site': 'cross-site' } }, 'exempt'),
    ).resolves.toBe(true);
  });

  it('ignores non-http contexts', async () => {
    await expect(guard.canActivate({ getType: () => 'ws' } as unknown as ExecutionContext)).resolves.toBe(true);
  });
});
