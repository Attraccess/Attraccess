import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceListVisibilityService } from '../visibility/resource-list-visibility.service';
import { ResourceActivityVisibilityService } from '../usage/authorization/resource-activity-visibility.service';

/**
 * Refuses the live feed before the stream opens. A refusal thrown from inside an `@Sse` handler can end up as an
 * `error` frame on an already-open 200 response; a guard always answers a plain 403.
 */
@Injectable()
export class ResourceActivityVisibleGuard implements CanActivate {
  constructor(
    private readonly activityVisibility: ResourceActivityVisibilityService,
    private readonly listVisibility: ResourceListVisibilityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Sign-in runs first (`@Auth()` sits below `@UseGuards` on the route); refuse rather than crash if that changes.
    if (!request.user) throw new UnauthorizedException();
    const raw = String(request.params['resourceId'] ?? '');
    // Only plain decimal ids are checked, as in the list interceptor; anything else gets the route ParseIntPipe's 400.
    if (!/^\d+$/.test(raw)) return true;
    const resourceId = Number(raw);
    // A hidden machine answers 404 like one that does not exist, before the activity rule can say 403 (ATT-843).
    if (!(await this.listVisibility.canSee(request.user, resourceId))) throw new ResourceNotFoundException(resourceId);
    // Hidden activity is refused unless the user is running their own session; the stream then carries only that session.
    if (!(await this.activityVisibility.canFollowLive(request.user, resourceId))) {
      throw new ForbiddenException('You cannot view activity on this resource');
    }
    return true;
  }
}
