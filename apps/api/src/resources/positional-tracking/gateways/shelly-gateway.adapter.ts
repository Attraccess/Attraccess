import { Injectable, Logger } from '@nestjs/common';
import { BleGatewayType } from '@attraccess/database-entities';
import { GatewayAdapter, GatewayPayloadParseResult, NormalizedGatewayAdvertisement } from './gateway-adapter.interface';
import { base64ToHex, parseEpochSecondsOrMs } from './gateway-payload.utils';

/** Script to put onto shelly device
// aioshelly BLE script 1.0
BLE.Scanner.Subscribe(function (ev, res) {
    if (ev === BLE.Scanner.SCAN_RESULT) {
        Shelly.emitEvent("ble.scan_result", {
            mac: res.addr,
            rssi: res.rssi,
            adv: btoa(res.advData),
            rsp: btoa(res.scanRsp),
        });
    }
});
BLE.Scanner.Start({
    duration_ms: -1,
    active: true,
    interval_ms: 320,
    window_ms: 30,
});
 */

type ShellyScanResult = {
  component?: string;
  id?: number;
  event?: string;
  data?: {
    mac?: string;
    rssi?: number;
    adv?: string;
    rsp?: string;
  };
  ts?: number;
};

type ShellyGatewayPayload = {
  src?: string;
  dst?: string;
  method?: string;
  params?: {
    ts?: number;
    events?: ShellyScanResult[];
  };
};

@Injectable()
export class ShellyGatewayAdapter implements GatewayAdapter {
  readonly type = BleGatewayType.SHELLY;

  private readonly logger = new Logger(ShellyGatewayAdapter.name);

  getDefaultTopic(identifier: string): string {
    return `${identifier}/events/rpc`;
  }

  isPayload(payload: unknown): payload is ShellyGatewayPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const maybePayload = payload as { params?: { events?: unknown } };
    return Array.isArray(maybePayload.params?.events);
  }

  parsePayload(payload: unknown): GatewayPayloadParseResult | null {
    if (!this.isPayload(payload)) {
      this.logger.warn(`Invalid payload for Shelly gateway: ${JSON.stringify(payload)}`);
      return null;
    }

    const gatewayIdentifier = payload.dst.replace('/events', '');
    const baseTimestamp = parseEpochSecondsOrMs(payload.params?.ts);
    const advertisements =
      payload.params?.events
        ?.filter((event) => event.event === 'ble.scan_result')
        .map((event) => {
          const dataHex = this.combineBase64Payloads(event.data?.adv, event.data?.rsp);
          if (!dataHex) {
            return null;
          }
          const observedAt = parseEpochSecondsOrMs(event.ts) ?? baseTimestamp;
          return {
            mac: event.data?.mac,
            rssi: event.data?.rssi,
            dataHex,
            observedAt,
          } as NormalizedGatewayAdvertisement;
        })
        .filter((advertisement): advertisement is NonNullable<typeof advertisement> => advertisement !== null) ?? [];

    return { gatewayIdentifier, advertisements };
  }

  private combineBase64Payloads(adv?: string | null, rsp?: string | null): string | null {
    const advHex = base64ToHex(adv);
    const rspHex = base64ToHex(rsp);
    if (!advHex && !rspHex) {
      return null;
    }
    return `${advHex ?? ''}${rspHex ?? ''}`;
  }
}
