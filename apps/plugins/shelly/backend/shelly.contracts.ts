import type { FirmwareStatus } from './shelly-firmware.service';
import type { FirmwareStage } from './shelly-firmware.service';
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
