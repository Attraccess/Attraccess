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

const NeedsPermissions = Reflector.createDecorator<string[]>();

export function Auth(...permissions: string[]) {
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
