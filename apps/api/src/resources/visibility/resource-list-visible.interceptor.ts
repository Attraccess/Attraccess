import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceListVisibilityService } from './resource-list-visibility.service';

/**
 * Answers 404 for a machine the signed-in user may not see (ATT-843), the same answer as for an id that does not
 * exist, so existence is not confirmed.
 *
 * This is an interceptor, not a guard, on purpose: a class-level guard runs before the route's own `@Auth()` has
 * signed the user in, while an interceptor runs after every guard. A request without a user is passed on; the
 * route's own sign-in has already refused it by then.
 */
@Injectable()
export class ResourceListVisibleInterceptor implements NestInterceptor {
  constructor(private readonly visibility: ResourceListVisibilityService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const params = request.params ?? {};
    const resourceId = Number(params['resourceId'] ?? params['id']);
    // A malformed id is answered with a 400 by the route's ParseIntPipe.
    if (request.user && Number.isInteger(resourceId) && !(await this.visibility.canSee(request.user, resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }
    return next.handle();
  }
}

/**
 * Put this on every controller whose routes live under `resources/:resourceId` or `resources/:id`. The route
 * inventory spec fails for a controller that lacks it.
 */
export const ResourceListVisible = () => applyDecorators(UseInterceptors(ResourceListVisibleInterceptor));
