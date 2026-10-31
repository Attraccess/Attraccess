import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingController } from '../../billing/billing.controller';
import { AuthController } from '../../users-and-auth/auth/auth.controller';
import { SsoLogoutController } from '../../users-and-auth/auth/sso/sso-logout.controller';
import { SSOController } from '../../users-and-auth/auth/sso/sso.controller';
import { ApprovedOriginsService } from './approved-origins.service';
import { CrossSiteWriteGuard } from './cross-site-write.guard';

type Controller = abstract new (...args: never[]) => object;

// Routes that other servers (identity providers, SumUp) call on purpose. They authenticate the
// caller themselves, so a cross-site POST must reach them.
const EXPECTED_EXEMPT: Array<[Controller, string]> = [
  [SSOController, 'samlLoginCallback'],
  [SSOController, 'samlDeleteUser'],
  [SSOController, 'oidcDeleteUser'],
  [SSOController, 'oidcUpdatePermissions'],
  [SSOController, 'samlUpdatePermissions'],
  [SSOController, 'oidcLogout'],
  [SSOController, 'samlLogout'],
  [SsoLogoutController, 'backchannel'],
  [SsoLogoutController, 'samlPost'],
  [BillingController, 'sumUpTopUpCallback'],
];

const guard = new CrossSiteWriteGuard(new Reflector(), {
  isApproved: async () => false,
  servedOrigin: () => 'https://attraccess.example',
} as unknown as ApprovedOriginsService);

const crossSitePost = (controller: Controller, method: string) =>
  guard.canActivate({
    getType: () => 'http',
    getHandler: () => (controller.prototype as Record<string, unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        path: `/api/${method}`,
        headers: { origin: 'https://idp.example', 'sec-fetch-site': 'cross-site' },
        cookies: { 'auth-session': 'session' },
      }),
    }),
  } as unknown as ExecutionContext);

const exemptHandlers = (controller: Controller): string[] => {
  const names = new Set<string>();
  for (let proto = controller.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof descriptor?.value === 'function' && Reflect.getMetadata('allowCrossSiteWrite', descriptor.value))
        names.add(name);
    }
  }
  return [...names].sort();
};

describe('cross-site write exemptions on real routes', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it.each(EXPECTED_EXEMPT.map(([controller, method]) => [controller.name, method, controller] as const))(
    '%s.%s accepts a cross-site POST',
    async (_name, method, controller) => {
      await expect(crossSitePost(controller, method)).resolves.toBe(true);
    },
  );

  it.each(
    (
      [
        [AuthController, 'refreshSession'],
        [AuthController, 'logoutEverywhere'],
        [BillingController, 'topUpWithSumUpReader'],
      ] as Array<[Controller, string]>
    ).map(([controller, method]) => [controller.name, method, controller] as const),
  )('%s.%s refuses a cross-site cookie POST', async (_name, method, controller) => {
    expect(typeof (controller.prototype as Record<string, unknown>)[method]).toBe('function');
    await expect(crossSitePost(controller, method)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exempts exactly the expected handlers and no whole controller', () => {
    for (const controller of [SSOController, SsoLogoutController, BillingController, AuthController]) {
      expect(Reflect.getMetadata('allowCrossSiteWrite', controller)).toBeUndefined();
      const expected = EXPECTED_EXEMPT.filter(([c]) => c === controller)
        .map(([, method]) => method)
        .sort();
      expect(exemptHandlers(controller)).toEqual(expected);
    }
  });
});
