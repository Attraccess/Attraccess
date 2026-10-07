import { NotFoundException } from '@nestjs/common';
import { ShellyDevice } from './shelly-device.entity';
import { BadRequestException } from '@nestjs/common';
import { ShellyControllerRemoveOperation } from './shelly.shelly-controller-remove-operation';

export abstract class ShellyControllerRequireDeviceWithGenerationOperation extends ShellyControllerRemoveOperation {
  protected async requireDeviceWithGeneration(id: number): Promise<ShellyDevice & { generation: number }> {
    const device = await this.registry.findById(id);
    if (!device) {
      throw new NotFoundException(`device ${id} not found`);
    }
    if (device.generation !== null) {
      return device as ShellyDevice & { generation: number };
    }

    const probed = await this.tryProbe(device.ipAddress);
    if (!probed.result) {
      throw new BadRequestException(`device generation is unknown; probe failed: ${probed.error}`);
    }
    await this.registry.updateProbe(id, {
      generation: probed.result.generation,
      model: probed.result.model,
      authState: probed.result.authState,
      lastProbeAt: probed.at,
      lastProbeError: null,
    });
    const updated = await this.registry.findById(id);
    if (!updated?.generation) {
      throw new NotFoundException(`device ${id} not found`);
    }
    return updated as ShellyDevice & { generation: number };
  }
}
