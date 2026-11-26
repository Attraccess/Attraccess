import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import {
  Auth,
  AuthAny,
  EffectivePermissionsGuard,
  NotAnMcpTool,
  SessionAuth,
  SessionOnlyGuard,
} from './auth-decorator';

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

describe('OpenAPI extensions', () => {
  // `@nestjs/swagger` stores extensions under this key and merges them into the operation.
  const extensionOf = (handler: unknown) => Reflect.getMetadata('swagger/apiExtension', handler as object) ?? {};

  @Auth()
  class ClassLevel {
    @Get()
    @Auth('resources.read')
    override() {
      return true;
    }

    @Get()
    plain() {
      return true;
    }

    @Get()
    @AuthAny('resources.read', 'resources.update')
    any() {
      return true;
    }

    @Get()
    @SessionAuth('resources.read')
    session() {
      return true;
    }

    @Get()
    @NotAnMcpTool('secrets')
    excluded() {
      return true;
    }
  }

  it('emits the requirement of Auth, AuthAny and SessionAuth', () => {
    expect(extensionOf(ClassLevel.prototype.any)['x-attraccess-auth']).toEqual({
      all: [],
      any: ['resources.read', 'resources.update'],
      sessionOnly: false,
    });
    expect(extensionOf(ClassLevel.prototype.session)['x-attraccess-auth']).toEqual({
      all: ['resources.read'],
      any: [],
      sessionOnly: true,
    });
  });

  it('lets a method-level requirement replace the class-level one, like the guard', () => {
    expect(extensionOf(ClassLevel.prototype.override)['x-attraccess-auth']).toEqual({
      all: ['resources.read'],
      any: [],
      sessionOnly: false,
    });
  });

  it('applies a class-level requirement to methods without their own', () => {
    expect(extensionOf(ClassLevel.prototype.plain)['x-attraccess-auth']).toEqual({
      all: [],
      any: [],
      sessionOnly: false,
    });
  });

  it('emits x-mcp-exclude with the reason on methods and classes', () => {
    expect(extensionOf(ClassLevel.prototype.excluded)['x-mcp-exclude']).toEqual({ reason: 'secrets' });

    @NotAnMcpTool('whole class')
    class Excluded {
      @Get()
      run() {
        return true;
      }
    }
    expect(extensionOf(Excluded.prototype.run)['x-mcp-exclude']).toEqual({ reason: 'whole class' });
  });
});
