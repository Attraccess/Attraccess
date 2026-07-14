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

import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { DualAuthGuard } from './dual-auth.guard';
import { AuthenticatedUser } from './auth.types';
import { SystemPermission } from '@attraccess/shared';

export type { SystemPermission };

const NeedsPermissions = Reflector.createDecorator<SystemPermission[]>();
const NeedsAnyPermission = Reflector.createDecorator<SystemPermission[]>();

export function Auth(...permissions: SystemPermission[]) {
  return applyDecorators(
    NeedsPermissions(permissions),
    UseGuards(DualAuthGuard, EffectivePermissionsGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

export function AuthAny(...permissions: SystemPermission[]) {
  return applyDecorators(
    NeedsAnyPermission(permissions),
    UseGuards(DualAuthGuard, EffectivePermissionsGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

@Injectable()
export class EffectivePermissionsGuard implements CanActivate {
  private readonly logger = new Logger(EffectivePermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const requiredAll = this.reflector.getAllAndOverride(NeedsPermissions, [
      context.getHandler(),
      context.getClass(),
    ]);
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

export const SystemPermissionsGuard = EffectivePermissionsGuard;
