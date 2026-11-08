import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MQTT_EXPLORER_PERMISSION } from './mqtt-explorer.constants';
import { MqttExplorerService } from './mqtt-explorer.service';
import { PublishMqttExplorerMessageDto } from './dtos/publish-mqtt-explorer-message.dto';

@ApiTags('MQTT')
@Auth(MQTT_EXPLORER_PERMISSION)
@Controller('mqtt/servers/:id/explorer')
export class MqttExplorerController {
  constructor(private readonly explorer: MqttExplorerService) {}

  @Post('publish')
  @ApiOperation({ summary: 'Publish a message through an MQTT server', operationId: 'mqttExplorerPublish' })
  @ApiResponse({ status: 201, description: 'The message was published' })
  @ApiResponse({ status: 400, description: 'The topic, payload or QoS is invalid' })
  @ApiResponse({ status: 404, description: 'MQTT server not found' })
  @ApiResponse({ status: 502, description: 'The broker did not accept the message' })
  publish(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PublishMqttExplorerMessageDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.explorer.publish(request.user, id, dto);
  }
}
