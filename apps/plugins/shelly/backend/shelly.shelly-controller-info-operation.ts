import { Body } from '@nestjs/common';
import { Post } from '@nestjs/common';
import type { ShellyDeviceInfo } from './shelly-device-api.service';
import { DeviceInfoBody } from './shelly.contracts';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { toDeviceCommunicationException } from './shelly.controller.to-device-communication-exception';
import { ShellyControllerReprobeOperation } from './shelly.shelly-controller-reprobe-operation';

export abstract class ShellyControllerInfoOperation extends ShellyControllerReprobeOperation {
  // POST rather than GET: the request can carry the device admin password, and a
  // query string would leak it into access logs and browser history.
  @Post('devices/:id/info')
  async info(@Param('id', ParseIntPipe) id: number, @Body() body: DeviceInfoBody): Promise<ShellyDeviceInfo> {
    const device = await this.requireDeviceWithGeneration(id);
    try {
      return await this.deviceApi.getDeviceInfo({
        ipAddress: device.ipAddress,
        generation: device.generation,
        username: body?.username,
        currentPassword: body?.currentPassword,
      });
    } catch (err) {
      throw toDeviceCommunicationException(err);
    }
  }
}
