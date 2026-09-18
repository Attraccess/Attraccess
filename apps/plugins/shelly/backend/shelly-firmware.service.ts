// Firmware/OTA handling (ATT-501). Both generations expose the same two
// operations behind completely different APIs:
//
//   Gen1   GET /ota                  -> { status, has_update, old_version, new_version, beta_version }
//          GET /ota?update=true      -> starts the OTA (`?beta=true` for the beta channel)
//   Gen2+  GET /rpc/Shelly.GetDeviceInfo  -> { ver }
//          GET /rpc/Shelly.CheckForUpdate -> { stable?: { version }, beta?: { version } }
//          POST /rpc/Shelly.Update        -> starts the OTA ({ stage: 'stable' | 'beta' })
//
// Both are normalised into FirmwareStatus so the UI does not need to branch.
import { Inject, Injectable } from '@nestjs/common';
import { ShellyHttpClient, type DeviceCredentials } from './shelly-http.client';

export type FirmwareStage = 'stable' | 'beta';

/** Mirrors the Gen1 `/ota` status values; Gen2+ can only report idle/unknown over REST. */
export type FirmwareState = 'idle' | 'pending' | 'updating' | 'unknown';

export interface FirmwareStatus {
  generation: number;
  currentVersion: string | null;
  /** Version offered on each channel, or null when the channel has nothing newer. */
  available: Record<FirmwareStage, string | null>;
  /**
   * Stable channel only, on purpose: this drives the "update available" nag in
   * the device table, and a device permanently offering a beta would nag
   * forever. `available.beta` still surfaces the beta in the drawer.
   */
  hasUpdate: boolean;
  state: FirmwareState;
  fetchedAt: string;
}

interface DeviceTarget {
  ipAddress: string;
  generation: number;
}

interface Gen1OtaResponse {
  status?: string;
  has_update?: boolean;
  old_version?: string;
  new_version?: string;
  beta_version?: string;
}

interface Gen2UpdateOffer {
  version?: string;
}

interface Gen2CheckForUpdateResponse {
  stable?: Gen2UpdateOffer;
  beta?: Gen2UpdateOffer;
}

@Injectable()
export class ShellyFirmwareService {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(@Inject(ShellyHttpClient) private readonly http: ShellyHttpClient) {}

  async getStatus(target: DeviceTarget & DeviceCredentials): Promise<FirmwareStatus> {
    return target.generation === 1 ? this.getGen1Status(target) : this.getGen2Status(target);
  }

  /**
   * Kicks off the OTA. The device answers before it reboots; from then on it is
   * unreachable for a while, so callers must poll getStatus() rather than expect
   * a completion signal here.
   */
  async startUpdate(target: DeviceTarget & DeviceCredentials, stage: FirmwareStage): Promise<void> {
    if (target.generation === 1) {
      const url = new URL(`http://${target.ipAddress}/ota`);
      url.searchParams.set(stage === 'beta' ? 'beta' : 'update', 'true');
      await this.http.getJson(url.toString(), target);
      return;
    }

    await this.http.postJson(`http://${target.ipAddress}/rpc/Shelly.Update`, { stage }, target);
  }

  private async getGen1Status(target: DeviceTarget & DeviceCredentials): Promise<FirmwareStatus> {
    const ota = (await this.http.getJson(`http://${target.ipAddress}/ota`, target)) as Gen1OtaResponse;
    const current = ota.old_version ?? null;
    const stable = ota.has_update && ota.new_version && ota.new_version !== current ? ota.new_version : null;
    const beta = ota.beta_version && ota.beta_version !== current ? ota.beta_version : null;

    return {
      generation: 1,
      currentVersion: current,
      available: { stable, beta },
      hasUpdate: stable !== null,
      state: toFirmwareState(ota.status),
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getGen2Status(target: DeviceTarget & DeviceCredentials): Promise<FirmwareStatus> {
    const [info, check] = await Promise.all([
      this.http.getJson(`http://${target.ipAddress}/rpc/Shelly.GetDeviceInfo`, target) as Promise<{ ver?: string }>,
      this.http.getJson(
        `http://${target.ipAddress}/rpc/Shelly.CheckForUpdate`,
        target,
      ) as Promise<Gen2CheckForUpdateResponse>,
    ]);

    const stable = check?.stable?.version ?? null;
    const beta = check?.beta?.version ?? null;

    return {
      generation: target.generation,
      currentVersion: info?.ver ?? null,
      available: { stable, beta },
      hasUpdate: stable !== null,
      // ponytail: Gen2+ only reports OTA progress over its WebSocket NotifyEvent
      // channel, not over REST — a device we can reach is by definition not
      // mid-update, so the UI infers "updating" from the device being offline
      // right after it triggered one.
      state: 'idle',
      fetchedAt: new Date().toISOString(),
    };
  }
}

function toFirmwareState(status: string | undefined): FirmwareState {
  return status === 'idle' || status === 'pending' || status === 'updating' ? status : 'unknown';
}
