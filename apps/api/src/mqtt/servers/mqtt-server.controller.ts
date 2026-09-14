import { recordAdministrationSafely, safeAuditHost } from '../../audit/audit-administration-policy';
import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MqttServer } from '@attraccess/database-entities';
import { MqttServerService } from './mqtt-server.service';
import { CreateMqttServerDto, UpdateMqttServerDto } from './dtos/mqtt-server.dto';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../../audit/audit.service';

@ApiTags('MQTT')
@Auth('resources.update')
@Controller('mqtt/servers')
export class MqttServerController {
  constructor(
    private readonly mqttServerService: MqttServerService,
    private readonly audit: AuditService,
  ) {}

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
    const server = await this.mqttServerService.create(createMqttServerDto);
    await this.record(req, 'mqtt_server.created', server, createMqttServerDto.password !== undefined);
    return server;
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
    return this.mqttServerService.update(id, updateMqttServerDto).then(async (server) => {
      await this.record(req, 'mqtt_server.updated', server, updateMqttServerDto.password !== undefined);
      return server;
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete MQTT server', operationId: 'mqttServersDeleteOne' })
  @ApiResponse({ status: 200, description: 'MQTT server deleted successfully' })
  @ApiResponse({ status: 404, description: 'MQTT server not found' })
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<void> {
    const server = await this.mqttServerService.findOne(id);
    await this.mqttServerService.remove(id);
    await this.record(req, 'mqtt_server.deleted', server);
  }

  private async record(req: AuthenticatedRequest, action: string, server: MqttServer, passwordChanged = false) {
    await recordAdministrationSafely(this.audit, {
      action,
      actorId: req.user.id,
      authenticationMethod: req.user.authenticationMethod,
      apiTokenId: req.user.apiTokenId,
      subjectType: 'mqtt-server',
      subjectId: server.id,
      details: {
        serverName: server.name,
        host: safeAuditHost(server.host),
        passwordChanged: passwordChanged ? 1 : 0,
        port: server.port,
        managementPort: server.managementPort ?? 0,
        usernameConfigured: server.username ? 1 : 0,
        useTls: server.useTls ? 1 : 0,
        caCertConfigured: server.caCert ? 1 : 0,
        tlsInsecure: server.tlsInsecure ? 1 : 0,
        tlsServername: safeAuditHost(server.tlsServername ?? ''),
        defaultPublishQos: server.defaultPublishQos,
        defaultPublishRetain: server.defaultPublishRetain ? 1 : 0,
        defaultSubscribeQos: server.defaultSubscribeQos,
      },
    });
  }
}
