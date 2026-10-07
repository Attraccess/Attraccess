import { ShellyDevice } from './shelly-device.entity';
import { AddDeviceBody } from './shelly.contracts';
import type { DiscoveryResult } from './discovery.service';
import type { ShellyDeviceInfo } from './shelly-device-api.service';
import type { FirmwareStage } from './shelly-firmware.service';
import type { FirmwareStatus } from './shelly-firmware.service';
import { DiscoverBody } from './shelly.contracts';
import { DeviceInfoBody } from './shelly.contracts';
import type { DeviceInfoQuery } from './shelly.contracts';
import { SetAuthBody } from './shelly.contracts';
import { FirmwareUpdateBody } from './shelly.contracts';
import { FirmwareOverviewEntry } from './shelly.contracts';
import { ProbeOutcome } from './shelly.contracts';

export abstract class ShellyControllerDiscoverContract {
  abstract discover(body: DiscoverBody): Promise<DiscoveryResult>;
  abstract list(): Promise<ShellyDevice[]>;
  abstract add(body: AddDeviceBody): Promise<ShellyDevice>;
  abstract firmwareOverview(): Promise<FirmwareOverviewEntry[]>;
  abstract firmwareStatus(id: number, query: DeviceInfoQuery): Promise<FirmwareStatus>;
  abstract startFirmwareUpdate(id: number, body: FirmwareUpdateBody): Promise<{ started: true; stage: FirmwareStage }>;
  abstract reprobe(id: number): Promise<ShellyDevice>;
  abstract info(id: number, body: DeviceInfoBody): Promise<ShellyDeviceInfo>;
  abstract setAuth(id: number, body: SetAuthBody): Promise<ShellyDevice>;
  abstract remove(id: number): Promise<{ deleted: boolean }>;
  protected abstract requireDeviceWithGeneration(id: number): Promise<ShellyDevice & { generation: number }>;
  protected abstract tryProbe(ipAddress: string): Promise<ProbeOutcome>;
}
