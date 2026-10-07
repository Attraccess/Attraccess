import { BadRequestException } from '@nestjs/common';
import { validateShellyAddress } from './shelly-address';
import { Body } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { ShellyDevice } from './shelly-device.entity';
import { AddDeviceBody } from './shelly.contracts';
import { ShellyControllerListOperation } from './shelly.shelly-controller-list-operation';

export abstract class ShellyControllerAddOperation extends ShellyControllerListOperation {
  @Post('devices')
  async add(@Body() body: AddDeviceBody): Promise<ShellyDevice> {
    if (body?.ipAddress !== undefined && typeof body.ipAddress !== 'string') {
      throw new BadRequestException('ipAddress must be a string');
    }
    const ipAddress = (body?.ipAddress ?? '').trim();
    if (!ipAddress) {
      throw new BadRequestException('ipAddress is required');
    }
    validateShellyAddress(ipAddress);
    if (await this.registry.findByIp(ipAddress)) {
      throw new ConflictException(`a device with IP ${ipAddress} already exists`);
    }
    const name = (body?.name ?? '').trim() || ipAddress;

    // Probe is best-effort: a device that is offline at add time is still
    // persisted (with the probe error recorded) so the operator can re-probe
    // it later instead of losing the entry.
    const probed = await this.tryProbe(ipAddress);
    return this.registry.create({
      name,
      ipAddress,
      generation: probed.result?.generation ?? null,
      model: probed.result?.model ?? null,
      authState: probed.result?.authState ?? 'unknown',
      lastProbeAt: probed.at,
      lastProbeError: probed.error,
    });
  }
}
