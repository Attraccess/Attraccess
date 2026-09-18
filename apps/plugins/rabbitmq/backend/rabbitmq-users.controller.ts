// HTTP surface for RabbitMQ user management (ATT-522).
//
// Mounts the user CRUD + permission routes into the host API under
// `/rabbitmq/users/...`, gated by the same access level as the host MQTT
// servers controller. The frontend user-management panel (MQTT server detail
// slot) is the only consumer.
//
// The vhost travels as a query parameter (not a path segment) because the
// default RabbitMQ vhost is literally "/", which does not survive as a path
// parameter.
import { Auth } from '@attraccess/plugins-backend-sdk';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import { RabbitmqUsersService } from './rabbitmq-users.service';
import type { RabbitmqUserList, SetRabbitmqPermissionDto, UpsertRabbitmqUserDto } from './rabbitmq-users.types';

@Auth('resources.update')
@Controller('rabbitmq')
export class RabbitmqUsersController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(@Inject(RabbitmqUsersService) private readonly users: RabbitmqUsersService) {}

  @Get('users/:mqttServerId')
  list(@Param('mqttServerId', ParseIntPipe) mqttServerId: number): Promise<RabbitmqUserList> {
    return this.users.listUsers(mqttServerId);
  }

  @Put('users/:mqttServerId/:username')
  upsert(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Param('username') username: string,
    @Body() dto: UpsertRabbitmqUserDto,
  ): Promise<void> {
    return this.users.upsertUser(mqttServerId, username, dto ?? {});
  }

  @Delete('users/:mqttServerId/:username')
  remove(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Param('username') username: string,
  ): Promise<void> {
    return this.users.deleteUser(mqttServerId, username);
  }

  @Put('users/:mqttServerId/:username/permissions')
  setPermissions(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Param('username') username: string,
    @Body() dto: SetRabbitmqPermissionDto,
  ): Promise<void> {
    if (!dto || typeof dto.vhost !== 'string') {
      throw new HttpException('A vhost is required.', HttpStatus.BAD_REQUEST);
    }
    return this.users.setPermissions(mqttServerId, username, dto);
  }

  @Delete('users/:mqttServerId/:username/permissions')
  clearPermissions(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Param('username') username: string,
    @Query('vhost') vhost?: string,
  ): Promise<void> {
    if (typeof vhost !== 'string' || vhost.length === 0) {
      throw new HttpException('A vhost query parameter is required.', HttpStatus.BAD_REQUEST);
    }
    return this.users.clearPermissions(mqttServerId, username, vhost);
  }
}
