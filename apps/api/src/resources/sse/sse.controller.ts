import { Controller, Param, ParseIntPipe, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
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
    // The guard has already refused viewers who may not see activity; every event is checked again on the way out.
    const stream = await this.events.subscribeResource(resourceId);
    return this.sse.wrap('resource_usage', this.activityVisibility.viewLiveStream(stream, req.user, resourceId));
  }
}
