// HTTP surface for RabbitMQ detection (ATT-521).
//
// Mounts `GET /rabbitmq/detection/:mqttServerId` into the host API, gated by the
// same access level as the host MQTT servers controller. The frontend slots
// (badge + status panel) read this to decide what, if anything, to render.
import { Auth } from '@attraccess/plugins-backend-sdk';
import { Controller, Get, Inject, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RabbitmqDetectionService } from './rabbitmq-detection.service';
import type { RabbitmqDetectionResult } from './rabbitmq-detection.types';

@Auth('resources.update')
@Controller('rabbitmq')
export class RabbitmqDetectionController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(@Inject(RabbitmqDetectionService) private readonly detection: RabbitmqDetectionService) {}

  @Get('detection/:mqttServerId')
  detect(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Query('refresh') refresh?: string,
  ): Promise<RabbitmqDetectionResult> {
    return this.detection.detect(mqttServerId, refresh === 'true');
  }
}
