import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { AuditController } from './audit.controller';
import { registerAuditAuthorizationAndQueryValidationFixture } from './audit.audit-authorization-and-query-validation.test-fixture';
export function registerUsesTheEffectivePermissionGuardForBothSessionAndTokenCeilingsCases(
  _fixture: ReturnType<typeof registerAuditAuthorizationAndQueryValidationFixture>,
) {
  it('uses the effective permission guard for both session and token ceilings', () => {
    const guard = new EffectivePermissionsGuard(new Reflector());
    const context = (user: unknown) =>
      ({
        getHandler: () => AuditController.prototype.list,
        getClass: () => AuditController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(context(undefined))).toThrow(UnauthorizedException);
    for (const authenticationMethod of ['session', 'api-token']) {
      expect(() =>
        guard.canActivate(
          context({ id: 1, authenticationMethod, effectivePermissions: new Set(['system.settings.manage']) }),
        ),
      ).toThrow(ForbiddenException);
      expect(
        guard.canActivate(
          context({ id: 1, authenticationMethod, effectivePermissions: new Set(['system.audit.read']) }),
        ),
      ).toBeTruthy();
    }
  });
}
