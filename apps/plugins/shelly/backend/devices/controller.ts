import { Auth } from '@attraccess/plugins-backend-sdk';
import {
  BadGatewayException,
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
  Query,
} from '@nestjs/common';
import { DeviceRegistryService } from './registry/service';
import type { DiscoveryResult } from './discovery/service';
import { DiscoveryService } from './discovery/service';
import { InvalidCidrError } from './discovery/network-scan';
import { validateShellyAddress } from '../communication/address';
import type { ShellyDeviceInfo } from '../communication/device-api.service';
import { ShellyDeviceApiService } from '../communication/device-api.service';
import { ShellyDevice } from './registry/device.entity';
import type { FirmwareStage, FirmwareStatus } from '../firmware/service.service';
import { ShellyFirmwareService } from '../firmware/service.service';
import { ShellyProbeService } from './discovery/probe.service';
import type { ProbeResult } from './types';

export interface AddDeviceBody {
  ipAddress?: string;
  name?: string;
}

export interface DeviceInfoBody {
  username?: string;
  currentPassword?: string;
}

export type DeviceInfoQuery = DeviceInfoBody;

export interface DiscoverBody {
  /** Subnet to scan, e.g. `192.168.1.0/24`. Omitted: the host's own networks. */
  cidr?: string;
}

export /** One row of the firmware overview: either a status or the reason it failed. */
interface FirmwareOverviewEntry {
  deviceId: number;
  status: FirmwareStatus | null;
  error: string | null;
}

export interface FirmwareUpdateBody extends DeviceInfoQuery {
  stage?: FirmwareStage;
}

export interface ProbeOutcome {
  result: ProbeResult | null;
  error: string | null;
  at: string;
}

export interface SetAuthBody {
  username?: string;
  currentPassword?: string;
  password?: string;
}

export /**
 * Talking to the device failed (unreachable, rejected credentials, …). Surface
 * the reason as a 502 instead of letting it bubble up as an opaque 500.
 */
function toDeviceCommunicationException(err: unknown): BadGatewayException {
  return new BadGatewayException(err instanceof Error ? err.message : String(err));
}

@Auth('resources.update')
@Controller('shelly')
export class ShellyController {
  protected async tryProbe(ipAddress: string): Promise<ProbeOutcome> {
    const at = new Date().toISOString();
    try {
      return { result: await this.probe.probe(ipAddress), error: null, at };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err), at };
    }
  }

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

  @Delete('devices/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ deleted: boolean }> {
    if (!(await this.registry.findById(id))) {
      throw new NotFoundException(`device ${id} not found`);
    }
    await this.registry.delete(id);
    return { deleted: true };
  }

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
      id,
    );
    return { started: true, stage };
  }

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

  @Get('devices/firmware')
  async firmwareOverview(): Promise<FirmwareOverviewEntry[]> {
    const devices = await this.registry.list();
    return Promise.all(
      devices.map(async (device): Promise<FirmwareOverviewEntry> => {
        if (device.generation === null) {
          return { deviceId: device.id, status: null, error: 'device generation is unknown; probe it first' };
        }
        try {
          const status = await this.firmware.getStatus({
            ipAddress: device.ipAddress,
            generation: device.generation,
          });
          return { deviceId: device.id, status, error: null };
        } catch (err) {
          return { deviceId: device.id, status: null, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }

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

  @Get('devices')
  list(): Promise<ShellyDevice[]> {
    return this.registry.list();
  }

  @Post('discovery')
  async discover(@Body() body: DiscoverBody): Promise<DiscoveryResult> {
    const cidr = (body?.cidr ?? '').trim() || undefined;
    try {
      return await this.discovery.discover(cidr);
    } catch (err) {
      // Only a bad CIDR is operator error; anything else is a real failure and
      // should not be dressed up as a 400.
      if (err instanceof InvalidCidrError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  constructor(
    @Inject(DeviceRegistryService) protected readonly registry: DeviceRegistryService,
    @Inject(ShellyProbeService) protected readonly probe: ShellyProbeService,
    @Inject(DiscoveryService) protected readonly discovery: DiscoveryService,
    @Inject(ShellyDeviceApiService) protected readonly deviceApi: ShellyDeviceApiService,
    @Inject(ShellyFirmwareService) protected readonly firmware: ShellyFirmwareService,
  ) {}
}
