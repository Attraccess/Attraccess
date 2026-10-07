import { Controller, Param, ParseIntPipe, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResourceEventsService } from './resource-events.service';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';

@ApiTags('Resources')
@Controller('resources')
export class SSEController {
  constructor(
    private readonly events: ResourceEventsService,
    private readonly sse: SseInstrumentation,
  ) {}

  @Sse(':resourceId/events')
  async streamEvents(@Param('resourceId', ParseIntPipe) resourceId: number) {
    return this.sse.wrap('resource_usage', await this.events.subscribeResource(resourceId));
  }
}
