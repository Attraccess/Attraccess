import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Body } from '@nestjs/common';
import type { FirmwareStage } from './shelly-firmware.service';
import { FirmwareUpdateBody } from './shelly.contracts';
import { ShellyControllerFirmwareStatusOperation } from './shelly.shelly-controller-firmware-status-operation';

export abstract class ShellyControllerStartFirmwareUpdateOperation extends ShellyControllerFirmwareStatusOperation {
  @Post('devices/:id/firmware/update')
  async startFirmwareUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FirmwareUpdateBody,
  ): Promise<{ started: true; stage: FirmwareStage }> {
    const stage = body?.stage ?? 'stable';
    if (stage !== 'stable' && stage !== 'beta') {
      throw new BadRequestException(`stage must be "stable" or "beta"`);
    }
    const device = await this.requireDeviceWithGeneration(id);
    await this.firmware.startUpdate(
      {
        ipAddress: device.ipAddress,
        generation: device.generation,
        username: body?.username,
        currentPassword: body?.currentPassword,
      },
      stage,
    );
    return { started: true, stage };
  }
}
