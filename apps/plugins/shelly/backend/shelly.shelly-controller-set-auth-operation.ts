import { NotFoundException } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { ShellyDevice } from './shelly-device.entity';
import { BadRequestException } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { SetAuthBody } from './shelly.contracts';
import { toDeviceCommunicationException } from './shelly.controller.to-device-communication-exception';
import { ShellyControllerInfoOperation } from './shelly.shelly-controller-info-operation';

export abstract class ShellyControllerSetAuthOperation extends ShellyControllerInfoOperation {
  @Post('devices/:id/auth')
  async setAuth(@Param('id', ParseIntPipe) id: number, @Body() body: SetAuthBody): Promise<ShellyDevice> {
    const password = body?.password?.trim();
    if (!password) {
      throw new BadRequestException('password is required');
    }
    const device = await this.requireDeviceWithGeneration(id);
    try {
      await this.deviceApi.setAdminPassword({
        ipAddress: device.ipAddress,
        generation: device.generation,
        username: body.username,
        currentPassword: body.currentPassword,
        password,
      });
    } catch (err) {
      throw toDeviceCommunicationException(err);
    }
    await this.registry.updateAuthState(id, 'required');
    const updated = await this.registry.findById(id);
    if (!updated) {
      throw new NotFoundException(`device ${id} not found`);
    }
    return updated;
  }
}
