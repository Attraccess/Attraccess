// Live device calls for status/config and admin credentials. Transport (timeouts,
// Basic/Digest auth replay) lives in ShellyHttpClient.
import { Inject, Injectable } from '@nestjs/common';
import { md5, ShellyHttpClient, type DeviceCredentials } from './shelly-http.client';

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
          ],
    );

    return { generation: target.generation, status, config, fetchedAt: new Date().toISOString() };
  }

  async setAdminPassword(input: SetAdminPasswordInput): Promise<void> {
    const username = input.username?.trim() || 'admin';
    if (input.generation === 1) {
      const url = new URL(`http://${input.ipAddress}/settings/login`);
      url.searchParams.set('enabled', '1');
      url.searchParams.set('username', username);
      url.searchParams.set('password', input.password);
      await this.http.getJson(url.toString(), input);
      return;
    }

    const info = (await this.http.getJson(`http://${input.ipAddress}/shelly`, input)) as { id?: string };
    const realm = info.id?.trim();
    if (!realm) {
      throw new Error('Shelly.SetAuth requires the device id from GET /shelly');
    }

    await this.http.postJson(
      `http://${input.ipAddress}/rpc/Shelly.SetAuth`,
      {
        user: username,
        realm,
        ha1: md5(`${username}:${realm}:${input.password}`),
      },
      input,
    );
  }
}
