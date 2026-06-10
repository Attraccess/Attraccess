// HTTP surface for the RabbitMQ connections viewer (ATT-523).
//
// Mounts under the host API, gated by the same access level as the host MQTT
// servers controller:
//   GET    /rabbitmq/connections/:mqttServerId          — live snapshot
//   DELETE /rabbitmq/connections/:mqttServerId?name=...  — force-close one
// The connection name rides in a query parameter because broker connection
// names contain spaces, colons and arrows ("ip:port -> ip:port") that fit
// poorly in a path segment.
import { Auth } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Controller, Delete, Get, Inject, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RabbitmqConnectionsService } from './rabbitmq-connections.service';
import type { RabbitmqCloseConnectionResult, RabbitmqConnectionsResult } from './rabbitmq-connections.types';

@Auth('canManageResources')
@Controller('rabbitmq')
export class RabbitmqConnectionsController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(@Inject(RabbitmqConnectionsService) private readonly connections: RabbitmqConnectionsService) {}

  @Get('connections/:mqttServerId')
  list(@Param('mqttServerId', ParseIntPipe) mqttServerId: number): Promise<RabbitmqConnectionsResult> {
    return this.connections.list(mqttServerId);
  }

  @Delete('connections/:mqttServerId')
  close(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Query('name') name?: string
  ): Promise<RabbitmqCloseConnectionResult> {
    if (!name) {
      throw new BadRequestException('Query parameter "name" is required.');
    }
    return this.connections.close(mqttServerId, name);
  }
}
