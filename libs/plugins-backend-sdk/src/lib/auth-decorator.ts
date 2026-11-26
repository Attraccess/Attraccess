import {
  Injectable,
  ExecutionContext,
  CanActivate,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';

import { ApiBearerAuth, ApiExtension, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { DualAuthGuard } from './dual-auth.guard';
import { AuthenticatedUser } from './auth.types';
import { SystemPermission } from '@attraccess/shared';
import type { PermissionKey } from './plugin-permissions';

export type { SystemPermission };

const NeedsPermissions = Reflector.createDecorator<PermissionKey[]>();
const NeedsAnyPermission = Reflector.createDecorator<PermissionKey[]>();

/** OpenAPI extension that carries the permission requirement of an operation (read by MCP tool generation). */
export const AUTH_EXTENSION = 'x-attraccess-auth';
/** OpenAPI extension that keeps an operation out of the MCP tool list. */
export const MCP_EXCLUDE_EXTENSION = 'x-mcp-exclude';

export interface AuthRequirementExtension {
  all: string[];
  any: string[];
  sessionOnly: boolean;
}

/**
 * Emits the requirement into the OpenAPI document. `@nestjs/swagger` keeps a key that is already set on a method
 * when the same decorator is applied to its class, so a method-level value wins, exactly like
 * `EffectivePermissionsGuard`'s `getAllAndOverride`.
 */
export function AuthRequirement(requirement: AuthRequirementExtension) {
  return ApiExtension(AUTH_EXTENSION, { ...requirement, all: [...requirement.all], any: [...requirement.any] });
}

/**
 * Keeps an operation out of the MCP tool list although REST callers may use it with an API token: secret or key
 * material, credential flows, host or firmware lifecycle, server-side fetches of arbitrary URLs. Works on methods and
 * classes. Tool generation is rule-based, so an endpoint that handles secrets with plain `@Auth` needs this.
 */
export function NotAnMcpTool(reason: string) {
  return ApiExtension(MCP_EXCLUDE_EXTENSION, { reason });
}

export function Auth(...permissions: PermissionKey[]) {
  return applyDecorators(
    NeedsPermissions(permissions),
    AuthRequirement({ all: permissions, any: [], sessionOnly: false }),
    UseGuards(DualAuthGuard, EffectivePermissionsGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

export function AuthAny(...permissions: PermissionKey[]) {
  return applyDecorators(
    NeedsAnyPermission(permissions),
    AuthRequirement({ all: [], any: permissions, sessionOnly: false }),
    UseGuards(DualAuthGuard, EffectivePermissionsGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

export function SessionAuth(...permissions: PermissionKey[]) {
  return applyDecorators(
    NeedsPermissions(permissions),
    AuthRequirement({ all: permissions, any: [], sessionOnly: true }),
    UseGuards(DualAuthGuard, EffectivePermissionsGuard, SessionOnlyGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

@Injectable()
export class EffectivePermissionsGuard implements CanActivate {
  private readonly logger = new Logger(EffectivePermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const requiredAll = this.reflector.getAllAndOverride(NeedsPermissions, [context.getHandler(), context.getClass()]);
    const requiredAny = this.reflector.getAllAndOverride(NeedsAnyPermission, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredAll || requiredAll.length === 0) && (!requiredAny || requiredAny.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      this.logger.warn('Auth check - No user found in request');
      throw new UnauthorizedException();
    }

    if (requiredAll && requiredAll.length > 0) {
      const missing = requiredAll.filter((p) => !user.effectivePermissions?.has(p));
      if (missing.length > 0) {
        this.logger.debug(`User ${user.id} missing permissions: ${missing.join(', ')}`);
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    if (requiredAny && requiredAny.length > 0) {
      const hasAny = requiredAny.some((p) => user.effectivePermissions?.has(p));
      if (!hasAny) {
        this.logger.debug(`User ${user.id} has none of the required permissions: ${requiredAny.join(', ')}`);
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return true;
  }
}

@Injectable()
export class SessionOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (user?.authenticationMethod !== 'session') {
      throw new ForbiddenException('Session authentication required');
    }

    return true;
  }
}

export const SystemPermissionsGuard = EffectivePermissionsGuard;
