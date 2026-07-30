// REST surface for the Zigbee transport (ATT-789), mounted alongside the
// registry routes under `/shelly`. Kept in its own controller so the Zigbee
// flow stays separable from the WiFi/RPC routes in shelly.controller.ts.
//
// Pairing is asynchronous — POST starts a run and returns immediately, the UI
// polls GET for progress — because the flow involves a device reboot and a join
// window of up to 254 seconds.
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
  Put,
} from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { DeviceRegistryService } from './device-registry.service';
import { ShellyDevice } from './shelly-device.entity';
import { GatewayNotConfiguredError, Z2mGatewayService, type GatewayStatus, type Z2mDevice } from './z2m-gateway.service';
import { PairingInProgressError, ZigbeePairingService, type PairingJob } from './zigbee-pairing.service';

interface GatewayBody {
  mqttServerId?: number;
  baseTopic?: string;
}

interface PairBody {
  username?: string;
  currentPassword?: string;
}

interface SetStateBody {
  /** Any z2m `/set` payload; `{state: 'ON'}` for a plain switch. */
  [key: string]: unknown;
}

/** A device's view of the gateway: the z2m record plus its last known state. */
export interface ZigbeeDeviceState {
  ieeeAddress: string;
  friendlyName: string | null;
  /** The z2m device record, or null if the gateway does not know it (yet). */
  gatewayDevice: Z2mDevice | null;
  /** Last state z2m published, or null if none has been seen since connecting. */
  state: Record<string, unknown> | null;
}

@Auth('resources.update')
@Controller('shelly')
export class ZigbeeController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(
    @Inject(Z2mGatewayService) private readonly gateway: Z2mGatewayService,
    @Inject(ZigbeePairingService) private readonly pairing: ZigbeePairingService,
    @Inject(DeviceRegistryService) private readonly registry: DeviceRegistryService
  ) {}

  @Get('zigbee/gateway')
  status(): Promise<GatewayStatus> {
    return this.gateway.status();
  }

  @Put('zigbee/gateway')
  async saveGateway(@Body() body: GatewayBody): Promise<GatewayStatus> {
    const mqttServerId = body?.mqttServerId;
    if (typeof mqttServerId !== 'number' || !Number.isInteger(mqttServerId)) {
      throw new BadRequestException('mqttServerId is required');
    }
    await this.gateway.saveConfig({ mqttServerId, baseTopic: body?.baseTopic ?? 'zigbee2mqtt' });
    return this.gateway.status();
  }

  /** Everything the gateway currently knows about, for diagnostics in the UI. */
  @Get('zigbee/devices')
  async gatewayDevices(): Promise<Z2mDevice[]> {
    await this.connectOrFail();
    await this.gateway.refreshDevices();
    return this.gateway.listDevices();
  }

  @Post('devices/:id/zigbee/pair')
  async pair(@Param('id', ParseIntPipe) id: number, @Body() body: PairBody): Promise<PairingJob> {
    const device = await this.requireDevice(id);
    if (device.generation === null || device.generation < 2) {
      throw new BadRequestException('only Gen2+ devices expose the Zigbee RPC surface; re-probe the device first');
    }
    await this.connectOrFail();

    try {
      return this.pairing.start(device as ShellyDevice & { generation: number }, {
        username: body?.username,
        currentPassword: body?.currentPassword,
      });
    } catch (err) {
      if (err instanceof PairingInProgressError) {
        // permit_join is network-wide, so a second concurrent run could not tell
        // which device had joined.
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  @Get('devices/:id/zigbee/pair')
  async pairingStatus(@Param('id', ParseIntPipe) id: number): Promise<PairingJob | null> {
    await this.requireDevice(id);
    return this.pairing.getJob(id);
  }

  /** Removes the device from the Zigbee network and puts it back on WiFi. */
  @Delete('devices/:id/zigbee/pair')
  async unpair(@Param('id', ParseIntPipe) id: number): Promise<ShellyDevice> {
    const device = await this.requireDevice(id);
    if (!device.zigbeeIeeeAddress) {
      throw new BadRequestException('device is not paired to the Zigbee gateway');
    }
    await this.connectOrFail();
    try {
      await this.pairing.unpair(device);
    } catch (err) {
      throw new BadGatewayException(err instanceof Error ? err.message : String(err));
    }
    return this.requireDevice(id);
  }

  @Get('devices/:id/zigbee/state')
  async state(@Param('id', ParseIntPipe) id: number): Promise<ZigbeeDeviceState> {
    const device = await this.requirePairedDevice(id);
    await this.connectOrFail();
    // Nudge z2m to re-publish and re-read the inventory; the cached values are
    // returned either way, so a sleeping device does not turn this into an error.
    try {
      await this.gateway.requestState(device.zigbeeIeeeAddress);
      await this.gateway.refreshDevices();
    } catch {
      /* best effort */
    }
    return {
      ieeeAddress: device.zigbeeIeeeAddress,
      friendlyName: device.zigbeeFriendlyName,
      gatewayDevice: this.gateway.findByIeee(device.zigbeeIeeeAddress),
      state: this.gateway.getState(device.zigbeeIeeeAddress),
    };
  }

  @Post('devices/:id/zigbee/state')
  async setState(@Param('id', ParseIntPipe) id: number, @Body() body: SetStateBody): Promise<{ published: boolean }> {
    const device = await this.requirePairedDevice(id);
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      throw new BadRequestException('a payload is required, e.g. {"state":"TOGGLE"}');
    }
    await this.connectOrFail();
    try {
      await this.gateway.setState(device.zigbeeIeeeAddress, body);
    } catch (err) {
      throw new BadGatewayException(err instanceof Error ? err.message : String(err));
    }
    return { published: true };
  }

  private async requireDevice(id: number): Promise<ShellyDevice> {
    const device = await this.registry.findById(id);
    if (!device) {
      throw new NotFoundException(`device ${id} not found`);
    }
    return device;
  }

  private async requirePairedDevice(id: number): Promise<ShellyDevice & { zigbeeIeeeAddress: string }> {
    const device = await this.requireDevice(id);
    if (!device.zigbeeIeeeAddress) {
      throw new BadRequestException('device is not paired to the Zigbee gateway');
    }
    return device as ShellyDevice & { zigbeeIeeeAddress: string };
  }

  private async connectOrFail(): Promise<void> {
    try {
      await this.gateway.ensureConnected();
    } catch (err) {
      if (err instanceof GatewayNotConfiguredError) {
        throw new BadRequestException('configure the zigbee2mqtt gateway first');
      }
      throw new BadGatewayException(err instanceof Error ? err.message : String(err));
    }
  }
}
