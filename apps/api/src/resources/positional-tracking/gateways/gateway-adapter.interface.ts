import { BleGatewayType } from '@attraccess/database-entities';

export type NormalizedGatewayAdvertisement = {
  mac?: string;
  rssi?: number;
  dataHex?: string;
  observedAt?: Date | null;
};

export type GatewayPayloadParseResult = {
  gatewayIdentifier: string | null;
  advertisements: NormalizedGatewayAdvertisement[];
};

export interface GatewayAdapter {
  readonly type: BleGatewayType;
  getDefaultTopic(identifier: string): string;
  isPayload(payload: unknown): boolean;
  parsePayload(payload: unknown): GatewayPayloadParseResult | null;
}
