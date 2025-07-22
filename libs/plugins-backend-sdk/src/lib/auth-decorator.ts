import {
  Injectable,
  ExecutionContext,
  CanActivate,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { SystemPermission, User } from '@attraccess/database-entities';

import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { DualAuthGuard } from './dual-auth.guard';

const NeedsSystemPermissions = Reflector.createDecorator<SystemPermission[]>();

export function Auth(...permissions: SystemPermission[]) {
  return applyDecorators(
    NeedsSystemPermissions(permissions),
    UseGuards(DualAuthGuard, SystemPermissionsGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' })
  );
}

@Injectable()
export class SystemPermissionsGuard implements CanActivate {
  private readonly logger = new Logger(SystemPermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const requiredPermissions = this.reflector.get(NeedsSystemPermissions, context.getHandler());

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('Auth check - No user found in request');
      throw new UnauthorizedException();
    }

    return this.matchPermissions(requiredPermissions, user);
  }

  private matchPermissions(requiredPermissions: SystemPermission | SystemPermission[], user: User): boolean {
    // Convert single permission to array if it's not already an array
    const permissionsArray = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

    // Check each permission individually and log the result
    const results = permissionsArray.map((permission) => {
      const hasPermission = user.systemPermissions[permission] === true;
      this.logger.debug(`Permission '${permission}': ${hasPermission}`);
      return hasPermission;
    });

    return results.every((result) => result === true);
  }
}
