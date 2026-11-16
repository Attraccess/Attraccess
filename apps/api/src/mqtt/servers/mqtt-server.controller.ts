import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MqttServer } from '@attraccess/database-entities';
import { MqttServerService } from './mqtt-server.service';
import { CreateMqttServerDto, UpdateMqttServerDto } from './dtos/mqtt-server.dto';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { auditActorOf } from '../../audit/recorder/audit-event';

@ApiTags('MQTT')
@Auth('resources.update')
@Controller('mqtt/servers')
export class MqttServerController {
  constructor(private readonly mqttServerService: MqttServerService) {}

  @Get()
  @ApiOperation({ summary: 'Get all MQTT servers', operationId: 'mqttServersGetAll' })
  @ApiResponse({
    status: 200,
    description: 'Returns all MQTT servers',
    type: [MqttServer],
  })
  async getAll(): Promise<MqttServer[]> {
    return this.mqttServerService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get MQTT server by ID', operationId: 'mqttServersGetOneById' })
  @ApiResponse({
    status: 200,
    description: 'Returns the MQTT server with the specified ID',
    type: MqttServer,
  })
  @ApiResponse({ status: 404, description: 'MQTT server not found' })
  async getOneById(@Param('id', ParseIntPipe) id: number): Promise<MqttServer> {
    return this.mqttServerService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new MQTT server', operationId: 'mqttServersCreateOne' })
  @ApiResponse({
    status: 201,
    description: 'MQTT server created successfully',
    type: MqttServer,
  })
  async createOne(
    @Body() createMqttServerDto: CreateMqttServerDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MqttServer> {
    return this.mqttServerService.create(createMqttServerDto, auditActorOf(req.user));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update MQTT server', operationId: 'mqttServersUpdateOne' })
  @ApiResponse({
    status: 200,
    description: 'MQTT server updated successfully',
    type: MqttServer,
  })
  @ApiResponse({ status: 404, description: 'MQTT server not found' })
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMqttServerDto: UpdateMqttServerDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MqttServer> {
    return this.mqttServerService.update(id, updateMqttServerDto, auditActorOf(req.user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete MQTT server', operationId: 'mqttServersDeleteOne' })
  @ApiResponse({ status: 200, description: 'MQTT server deleted successfully' })
  @ApiResponse({ status: 404, description: 'MQTT server not found' })
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.mqttServerService.remove(id, auditActorOf(req.user));
  }
}
