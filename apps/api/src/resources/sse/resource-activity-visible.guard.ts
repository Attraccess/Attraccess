import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceActivityVisibilityService } from '../usage/authorization/resource-activity-visibility.service';

/**
 * Refuses the live feed before the stream opens. A refusal thrown from inside an `@Sse` handler can end up as an
 * `error` frame on an already-open 200 response; a guard always answers a plain 403.
 */
@Injectable()
export class ResourceActivityVisibleGuard implements CanActivate {
  constructor(private readonly activityVisibility: ResourceActivityVisibilityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const resourceId = Number(request.params['resourceId']);
    // A malformed id is answered with a 400 by the route's ParseIntPipe.
    if (!Number.isInteger(resourceId)) return true;
    if ((await this.activityVisibility.resolve(request.user, resourceId)) === 'none') {
      throw new ForbiddenException('You cannot view activity on this resource');
    }
    return true;
  }
}
