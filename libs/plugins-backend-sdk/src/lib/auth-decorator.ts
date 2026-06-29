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

// Canonical set of system permission keys — mirrors the RBAC seed migration.
// Adding a key here is the only change needed to make it usable in @Auth().
export type SystemPermission =
  | 'resources.read'
  | 'resources.create'
  | 'resources.update'
  | 'resources.delete'
  | 'resources.access.manage'
  | 'resources.maintenance.manage'
  | 'users.read'
  | 'users.create'
  | 'users.update'
  | 'users.delete'
  | 'users.roles.manage'
  | 'system.settings.manage'
  | 'system.sso.manage'
  | 'system.plugins.manage'
  | 'billing.read'
  | 'billing.manage';

const NeedsPermissions = Reflector.createDecorator<SystemPermission[]>();

export function Auth(...permissions: SystemPermission[]) {
  return applyDecorators(
    NeedsPermissions(permissions),
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
    const requiredPermissions = this.reflector.get(NeedsPermissions, context.getHandler());

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      this.logger.warn('Auth check - No user found in request');
      throw new UnauthorizedException();
    }

    const missing = requiredPermissions.filter((p) => !user.effectivePermissions?.has(p));
    if (missing.length > 0) {
      this.logger.debug(`User ${user.id} missing permissions: ${missing.join(', ')}`);
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

// ponytail: keep legacy export name so existing plugin code that imports SystemPermissionsGuard still compiles
export const SystemPermissionsGuard = EffectivePermissionsGuard;
