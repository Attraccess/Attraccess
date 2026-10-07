import type { FirmwareStatus } from './shelly-firmware.service';
import type { DeviceInfoQuery } from './shelly.contracts';
import { Get } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Query } from '@nestjs/common';
import { ShellyControllerFirmwareOverviewOperation } from './shelly.shelly-controller-firmware-overview-operation';

export abstract class ShellyControllerFirmwareStatusOperation extends ShellyControllerFirmwareOverviewOperation {
  @Get('devices/:id/firmware')
  async firmwareStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DeviceInfoQuery,
  ): Promise<FirmwareStatus> {
    const device = await this.requireDeviceWithGeneration(id);
    return this.firmware.getStatus({
      ipAddress: device.ipAddress,
      generation: device.generation,
      username: query.username,
      currentPassword: query.currentPassword,
    });
  }
}
