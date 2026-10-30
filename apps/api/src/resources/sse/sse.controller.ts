import { Controller, ForbiddenException, Param, ParseIntPipe, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { map } from 'rxjs/operators';
import { ResourceEventsService } from './resource-events.service';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import { ResourceActivityVisibilityService } from '../usage/authorization/resource-activity-visibility.service';
import { ResourceActivityVisibleGuard } from './resource-activity-visible.guard';

@ApiTags('Resources')
@Controller('resources')
export class SSEController {
  constructor(
    private readonly events: ResourceEventsService,
    private readonly sse: SseInstrumentation,
    private readonly activityVisibility: ResourceActivityVisibilityService,
  ) {}

  @Sse(':resourceId/events')
  @UseGuards(ResourceActivityVisibleGuard)
  @Auth()
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - Activity on this resource is not visible to the user' })
  async streamEvents(@Param('resourceId', ParseIntPipe) resourceId: number, @Req() req: AuthenticatedRequest) {
    const access = await this.activityVisibility.resolve(req.user, resourceId);
    if (access === 'none') throw new ForbiddenException('You cannot view activity on this resource');
    const stream = await this.events.subscribeResource(resourceId);
    return this.sse.wrap(
      'resource_usage',
      stream.pipe(map((event) => this.activityVisibility.viewLiveEvent(event, access, req.user.id))),
    );
  }
}
