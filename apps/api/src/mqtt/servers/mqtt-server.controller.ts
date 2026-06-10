import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MqttServer } from '@attraccess/database-entities';
import { MqttServerService } from './mqtt-server.service';
import { CreateMqttServerDto, UpdateMqttServerDto, MqttServerConnectionStateDto } from './dtos/mqtt-server.dto';
import { Auth } from '@attraccess/plugins-backend-sdk';

@ApiTags('MQTT')
@Auth('canManageResources')
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

  @Get('status')
  @ApiOperation({
    summary: 'Get the live connection status of all MQTT servers',
    operationId: 'mqttServersGetStatusOfAll',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the connection state of every configured MQTT server',
    type: [MqttServerConnectionStateDto],
  })
  async getStatusOfAll(): Promise<MqttServerConnectionStateDto[]> {
    return this.mqttServerService.getConnectionStates();
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
  async createOne(@Body() createMqttServerDto: CreateMqttServerDto): Promise<MqttServer> {
    return this.mqttServerService.create(createMqttServerDto);
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
  ): Promise<MqttServer> {
    return this.mqttServerService.update(id, updateMqttServerDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete MQTT server', operationId: 'mqttServersDeleteOne' })
  @ApiResponse({ status: 200, description: 'MQTT server deleted successfully' })
  @ApiResponse({ status: 404, description: 'MQTT server not found' })
  async deleteOne(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.mqttServerService.remove(id);
  }
}
