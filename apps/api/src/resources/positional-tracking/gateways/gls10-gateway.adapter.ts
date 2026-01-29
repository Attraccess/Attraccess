import { Injectable } from '@nestjs/common';
import { BleGatewayType } from '@attraccess/database-entities';
import { GatewayAdapter, GatewayPayloadParseResult, NormalizedGatewayAdvertisement } from './gateway-adapter.interface';

type Gls10GatewayAdvertisement = {
  mac?: string;
  rssi?: number;
  n?: string;
  ad?: string;
  ts?: number;
};

type Gls10GatewayPayload = {
  dev_wifi_sta_mac?: string;
  dev_ble_mac?: string;
  dev_sn?: string;
  dev_id?: string;
  dev_version?: string;
  dev_list?: Gls10GatewayAdvertisement[];
};

@Injectable()
export class Gls10GatewayAdapter implements GatewayAdapter {
  readonly type = BleGatewayType.GLS10;

  getDefaultTopic(identifier: string): string {
    return `GL-IoT/dataTopic/${identifier}`;
  }

  isPayload(payload: unknown): payload is Gls10GatewayPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const maybePayload = payload as { dev_list?: unknown };
    return Array.isArray(maybePayload.dev_list);
  }

  parsePayload(payload: unknown): GatewayPayloadParseResult | null {
    if (!this.isPayload(payload)) {
      return null;
    }
    const gatewayIdentifier = payload.dev_ble_mac ?? payload.dev_wifi_sta_mac ?? null;
    const advertisements: NormalizedGatewayAdvertisement[] = (payload.dev_list ?? []).map((advertisement) => ({
      mac: advertisement.mac,
      rssi: advertisement.rssi,
      dataHex: advertisement.ad,
      observedAt: typeof advertisement.ts === 'number' ? new Date(advertisement.ts) : null,
    }));
    return { gatewayIdentifier, advertisements };
  }
}
