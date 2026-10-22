import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceActivityPolicy } from './resource-activity-policy.service';

/** Reject before Nest commits streaming response headers while awaiting database reads. */
@Injectable()
export class ResourceActivityGuard implements CanActivate {
  constructor(private readonly activity: ResourceActivityPolicy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const resourceId = Number(request.params.resourceId);
    if (!Number.isSafeInteger(resourceId) || resourceId <= 0) throw new BadRequestException('Invalid resource ID');
    await this.activity.assertRead(resourceId, request.user);
    return true;
  }
}
