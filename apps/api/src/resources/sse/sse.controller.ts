import { ResourceActivityGuard } from '../activity/resource-activity.guard';
import { Request } from 'express';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { concatMap } from 'rxjs';
import { SessionStrategy } from '../../users-and-auth/strategies/session.strategy';
import { ResourceActivityPolicy } from '../activity/resource-activity-policy.service';
import { Controller, Param, ParseIntPipe, Sse, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResourceEventsService } from './resource-events.service';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';

@ApiTags('Resources')
@Controller('resources')
@Auth()
export class SSEController {
  constructor(
    private readonly events: ResourceEventsService,
    private readonly sse: SseInstrumentation,
    private readonly activity: ResourceActivityPolicy,
    private readonly sessions: SessionStrategy,
  ) {}

  @Sse(':resourceId/events')
  @UseGuards(ResourceActivityGuard)
  async streamEvents(@Param('resourceId', ParseIntPipe) resourceId: number, @Req() req: AuthenticatedRequest) {
    await this.activity.assertRead(resourceId, req.user);
    const source = await this.events.subscribeResource(resourceId);
    return this.sse.wrap(
      'resource_usage',
      source.pipe(
        concatMap(async (event) => {
          const user = await this.sessions.validate(req as unknown as Request);
          await this.activity.assertRead(resourceId, user);
          return event;
        }),
      ),
    );
  }
}
