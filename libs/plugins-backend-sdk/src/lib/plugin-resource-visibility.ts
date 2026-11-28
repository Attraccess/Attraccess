import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  NotFoundException,
  SetMetadata,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from './auth.types';
import type { PluginAccessPrincipal } from './plugin-resource-access';

/**
 * The 404 core answers for a machine that does not exist, and for one the caller may not see, so existence is not
 * confirmed. Throw it from a plugin route for a machine named in a body or query that
 * `context.resourceAccess.canSee` refuses.
 */
export class ResourceNotFoundException extends NotFoundException {
  constructor(resourceId: number) {
    super('ResourceNotFoundException', {
      description: `Resource with ID ${resourceId} not found`,
    });
  }
}

/** Token under which the host provides {@link PluginResourceVisibilityHost} to every plugin module. */
export const PLUGIN_RESOURCE_VISIBILITY_HOST = Symbol.for('attraccess.plugin.resource-visibility-host');

/**
 * What {@link ResourceVisible} asks the host. Implemented by the host; a plugin test that builds a Nest module with
 * decorated controllers provides a fake under {@link PLUGIN_RESOURCE_VISIBILITY_HOST}.
 */
export interface PluginResourceVisibilityHost {
  canSee(principal: PluginAccessPrincipal, resourceId: number): Promise<boolean>;
}

const RESOURCE_ID_PARAM = 'attraccess:plugin-resource-id-param';

/** The interceptor behind {@link ResourceVisible}; use the decorator. */
@Injectable()
export class PluginResourceVisibleInterceptor implements NestInterceptor {
  constructor(
    @Inject(PLUGIN_RESOURCE_VISIBILITY_HOST) private readonly visibility: PluginResourceVisibilityHost,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const param = this.reflector.getAllAndOverride<string>(RESOURCE_ID_PARAM, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const raw = String(request.params?.[param] ?? '');
    // Only plain decimal ids are checked; anything else is answered with a 400 by the route's ParseIntPipe.
    const resourceId = /^\d+$/.test(raw) ? Number(raw) : undefined;
    if (request.user && resourceId !== undefined && !(await this.visibility.canSee(request.user, resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }
    return next.handle();
  }
}

/**
 * Put this on every plugin route (or controller) that serves `resources/:resourceId`: for a signed-in request, a
 * machine the caller may not see (see `context.resourceAccess.canSee`) answers 404 {@link ResourceNotFoundException}
 * before the handler runs, like on core's per-machine routes. A request without a user is passed on; the route's
 * `@Auth()` has already refused it. It needs no plugin permission.
 *
 * `param` names the route parameter that holds the machine id: pass `'id'` for a `resources/:id` route. It is an
 * interceptor, not a guard, because a class-level guard would run before the route's own `@Auth()`.
 */
export const ResourceVisible = (param = 'resourceId') =>
  applyDecorators(SetMetadata(RESOURCE_ID_PARAM, param), UseInterceptors(PluginResourceVisibleInterceptor));
