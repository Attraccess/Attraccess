// Live device calls for status/config and admin credentials. Transport (timeouts,
// Basic/Digest auth replay) lives in ShellyHttpClient.
import { Inject, Injectable } from '@nestjs/common';
import { sha256, ShellyHttpClient, type DeviceCredentials } from './shelly-http.client';

export type { DeviceCredentials } from './shelly-http.client';

interface DeviceTarget {
  ipAddress: string;
  generation: number;
}

export interface ShellyDeviceInfo {
  generation: number;
  status: unknown;
  config: unknown;
  fetchedAt: string;
}

export interface SetAdminPasswordInput extends DeviceTarget, DeviceCredentials {
  password: string;
}

@Injectable()
export class ShellyDeviceApiService {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(@Inject(ShellyHttpClient) private readonly http: ShellyHttpClient) {}

  async getDeviceInfo(target: DeviceTarget & DeviceCredentials): Promise<ShellyDeviceInfo> {
    const [status, config] = await Promise.all(
      target.generation === 1
        ? [
            this.http.getJson(`http://${target.ipAddress}/status`, target),
            this.http.getJson(`http://${target.ipAddress}/settings`, target),
          ]
        : [
            this.http.getJson(`http://${target.ipAddress}/rpc/Shelly.GetStatus`, target),
            this.http.getJson(`http://${target.ipAddress}/rpc/Shelly.GetConfig`, target),
          ]
    );

    return { generation: target.generation, status, config, fetchedAt: new Date().toISOString() };
  }

  async setAdminPassword(input: SetAdminPasswordInput): Promise<void> {
    if (input.generation === 1) {
      const url = new URL(`http://${input.ipAddress}/settings/login`);
      url.searchParams.set('enabled', '1');
      url.searchParams.set('username', input.username?.trim() || 'admin');
      url.searchParams.set('password', input.password);
      await this.http.getJson(url.toString(), input);
      return;
    }

    const info = (await this.http.getJson(`http://${input.ipAddress}/shelly`, input)) as { id?: string };
    const realm = info.id?.trim();
    if (!realm) {
      throw new Error('Shelly.SetAuth requires the device id from GET /shelly');
    }

    // Gen2+ supports exactly one user ("admin") and hashes ha1 with SHA-256, not
    // MD5 — the device answers HTTP 500 for anything else.
    const gen2User = 'admin';
    await this.http.postJson(
      `http://${input.ipAddress}/rpc/Shelly.SetAuth`,
      {
        user: gen2User,
        realm,
        ha1: sha256(`${gen2User}:${realm}:${input.password}`),
      },
      input
    );
  }
}
