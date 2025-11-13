import { Injectable } from '@nestjs/common';
import { BalenaSDK, getSdk as getBalenaSDK } from 'balena-sdk';

@Injectable()
export class AppService {
  private readonly balenaSDK: BalenaSDK | null = null;
  private readonly balenaDeviceId: string | null = null;

  public constructor() {
    const balenaApiToken = process.env.BALENA_API_TOKEN;
    this.balenaDeviceId = process.env.BALENA_DEVICE_UUID;

    if (balenaApiToken) {
      this.balenaSDK = getBalenaSDK();
      this.balenaSDK.auth.loginWithToken(balenaApiToken);
    }
  }

  private ensureBalena(sdk: BalenaSDK | null): { sdk: BalenaSDK; deviceId: string } {
    if (!sdk) {
      throw new Error('Balena SDK not available, did you set the BALENA_API_TOKEN environment variable?');
    }

    if (!this.balenaDeviceId) {
      throw new Error('Balena device ID not available, did you set the BALENA_DEVICE_UUID environment variable?');
    }

    return { sdk, deviceId: this.balenaDeviceId };
  }

  public getInfo(): { name: string; status: string } {
    return { name: 'Attraccess API', status: 'ok' };
  }

  public async balenaRebootHost(): Promise<void> {
    const { sdk, deviceId } = this.ensureBalena(this.balenaSDK);

    await sdk.models.device.reboot(deviceId);
  }

  public async balenaShutdownHost(): Promise<void> {
    const { sdk, deviceId } = this.ensureBalena(this.balenaSDK);

    await sdk.models.device.shutdown(deviceId, { force: false });
  }
}
