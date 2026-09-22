import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Auth, AuthAny, EffectivePermissionsGuard, SessionOnlyGuard } from './auth-decorator';

describe('SessionOnlyGuard', () => {
  const guard = new SessionOnlyGuard();

  it('rejects API token principals', () => {
    const context = requestContext({ user: { authenticationMethod: 'api-token' } });

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException('Session authentication required'));
  });

  it('allows session principals', () => {
    const context = requestContext({ user: { authenticationMethod: 'session' } });

    expect(guard.canActivate(context)).toBe(true);
  });
});

function requestContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('EffectivePermissionsGuard', () => {
  class Routes {
    @Auth('resources.read', 'resources.update')
    all() {
      return true;
    }

    @AuthAny('resources.read', 'resources.update')
    any() {
      return true;
    }

    @Auth()
    authenticated() {
      return true;
    }
  }
  const guard = new EffectivePermissionsGuard(new Reflector());
  const context = (handler: keyof Routes, user?: unknown): ExecutionContext =>
    new ExecutionContextHost([{ user }], Routes, Routes.prototype[handler]);

  it('allows routes with no permission requirement', () => {
    expect(guard.canActivate(context('authenticated'))).toBe(true);
  });

  it('requires a principal when permissions are declared', () => {
    expect(() => guard.canActivate(context('all'))).toThrow(UnauthorizedException);
  });

  it('requires every permission for Auth', () => {
    expect(() =>
      guard.canActivate(context('all', { id: 1, effectivePermissions: new Set(['resources.read']) })),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        context('all', { id: 1, effectivePermissions: new Set(['resources.read', 'resources.update']) }),
      ),
    ).toBe(true);
  });

  it('accepts one matching permission for AuthAny', () => {
    expect(guard.canActivate(context('any', { id: 1, effectivePermissions: new Set(['resources.update']) }))).toBe(
      true,
    );
    expect(() => guard.canActivate(context('any', { id: 1, effectivePermissions: new Set(['users.read']) }))).toThrow(
      ForbiddenException,
    );
  });

  it.each(['all', 'any'] as const)('rejects missing effective permissions for %s', (handler) => {
    expect(() => guard.canActivate(context(handler, { id: 1 }))).toThrow(ForbiddenException);
  });
});
