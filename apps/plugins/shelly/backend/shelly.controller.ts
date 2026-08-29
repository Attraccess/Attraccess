// REST surface for the Shelly device registry, mounted into the host API under
// `/shelly`. Gated behind `resources.update` (device management is an admin-ish capability).
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
import { Auth } from '@attraccess/plugins-backend-sdk';
import { DeviceRegistryService } from './device-registry.service';
import { DiscoveryService, type DiscoveryResult } from './discovery.service';
import { InvalidCidrError, isPrivateIpv4 } from './network-scan';
import { ShellyDeviceApiService, type ShellyDeviceInfo } from './shelly-device-api.service';
import { ShellyFirmwareService, type FirmwareStage, type FirmwareStatus } from './shelly-firmware.service';
import { ShellyProbeService } from './shelly-probe.service';
import { ShellyDevice } from './shelly-device.entity';
import type { ProbeResult } from './types';

interface AddDeviceBody {
  ipAddress?: string;
  name?: string;
}

interface DiscoverBody {
  /** Subnet to scan, e.g. `192.168.1.0/24`. Omitted: the host's own networks. */
  cidr?: string;
}

interface DeviceInfoBody {
  username?: string;
  currentPassword?: string;
}

interface SetAuthBody {
  username?: string;
  currentPassword?: string;
  password?: string;
}

interface FirmwareUpdateBody extends DeviceInfoQuery {
  stage?: FirmwareStage;
}

/** One row of the firmware overview: either a status or the reason it failed. */
interface FirmwareOverviewEntry {
  deviceId: number;
  status: FirmwareStatus | null;
  error: string | null;
}

interface ProbeOutcome {
  result: ProbeResult | null;
  error: string | null;
  at: string;
}

@Auth('resources.update')
@Controller('shelly')
export class ShellyController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(
    @Inject(DeviceRegistryService) private readonly registry: DeviceRegistryService,
    @Inject(ShellyProbeService) private readonly probe: ShellyProbeService,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(ShellyDeviceApiService) private readonly deviceApi: ShellyDeviceApiService,
    @Inject(ShellyFirmwareService) private readonly firmware: ShellyFirmwareService,
  ) {}

  // Runs inline rather than as a background job: a /24 is ~250 probes at a 1s
  // timeout and 64 in flight, so a few seconds. Larger subnets are rejected by
  // expandCidr instead of being made asynchronous.
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
    if (!isPrivateIpv4(ipAddress)) {
      throw new BadRequestException('ipAddress must be a private IPv4 address without a port or hostname');
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

  // Declared before the `devices/:id/...` routes so `firmware` is never parsed
  // as a device id. Best-effort by design: one unreachable or password-protected
  // device must not blank out the whole overview.
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

  @Delete('devices/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ deleted: boolean }> {
    if (!(await this.registry.findById(id))) {
      throw new NotFoundException(`device ${id} not found`);
    }
    await this.registry.delete(id);
    return { deleted: true };
  }

  private async requireDeviceWithGeneration(id: number): Promise<ShellyDevice & { generation: number }> {
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

  private async tryProbe(ipAddress: string): Promise<ProbeOutcome> {
    const at = new Date().toISOString();
    try {
      return { result: await this.probe.probe(ipAddress), error: null, at };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err), at };
    }
  }
}

/**
 * Talking to the device failed (unreachable, rejected credentials, …). Surface
 * the reason as a 502 instead of letting it bubble up as an opaque 500.
 */
function toDeviceCommunicationException(err: unknown): BadGatewayException {
  return new BadGatewayException(err instanceof Error ? err.message : String(err));
}
