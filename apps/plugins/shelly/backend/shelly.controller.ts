// REST surface for the Shelly device registry, mounted into the host API under
// `/shelly`. Gated behind `canManageResources` — the same access level as the
// host MQTT servers settings (device management is an admin-ish capability).
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { DeviceRegistryService } from './device-registry.service';
import { ShellyProbeService } from './shelly-probe.service';
import type { ProbeResult, ShellyDevice } from './types';

interface AddDeviceBody {
  ipAddress?: string;
  name?: string;
}

interface ProbeOutcome {
  result: ProbeResult | null;
  error: string | null;
  at: string;
}

@Auth('canManageResources')
@Controller('shelly')
export class ShellyController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(
    @Inject(DeviceRegistryService) private readonly registry: DeviceRegistryService,
    @Inject(ShellyProbeService) private readonly probe: ShellyProbeService
  ) {}

  @Get('devices')
  list(): Promise<ShellyDevice[]> {
    return this.registry.list();
  }

  @Post('devices')
  async add(@Body() body: AddDeviceBody): Promise<ShellyDevice> {
    const ipAddress = (body?.ipAddress ?? '').trim();
    if (!ipAddress) {
      throw new BadRequestException('ipAddress is required');
    }
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

  @Post('devices/:id/probe')
  async reprobe(@Param('id', ParseIntPipe) id: number): Promise<ShellyDevice> {
    const device = await this.registry.findById(id);
    if (!device) {
      throw new NotFoundException(`device ${id} not found`);
    }
    const probed = await this.tryProbe(device.ipAddress);
    await this.registry.updateProbe(id, {
      // On a failed re-probe keep the previously-known values rather than
      // wiping them; only the error + timestamp are refreshed.
      generation: probed.result?.generation ?? device.generation,
      model: probed.result?.model ?? device.model,
      authState: probed.result?.authState ?? device.authState,
      lastProbeAt: probed.at,
      lastProbeError: probed.error,
    });
    const updated = await this.registry.findById(id);
    if (!updated) {
      throw new NotFoundException(`device ${id} not found`);
    }
    return updated;
  }

  @Delete('devices/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ deleted: boolean }> {
    if (!(await this.registry.findById(id))) {
      throw new NotFoundException(`device ${id} not found`);
    }
    await this.registry.delete(id);
    return { deleted: true };
  }

  private async tryProbe(ipAddress: string): Promise<ProbeOutcome> {
    const at = new Date().toISOString();
    try {
      return { result: await this.probe.probe(ipAddress), error: null, at };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err), at };
    }
  }
}
