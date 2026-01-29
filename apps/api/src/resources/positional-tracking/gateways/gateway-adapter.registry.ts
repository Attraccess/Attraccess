import { Injectable } from '@nestjs/common';
import { BleGatewayType } from '@attraccess/database-entities';
import { GatewayAdapter } from './gateway-adapter.interface';
import { Gls10GatewayAdapter } from './gls10-gateway.adapter';
import { ShellyGatewayAdapter } from './shelly-gateway.adapter';

@Injectable()
export class GatewayAdapterRegistry {
  private readonly adapters = new Map<BleGatewayType, GatewayAdapter>();

  constructor(
    gls10Adapter: Gls10GatewayAdapter,
    shellyAdapter: ShellyGatewayAdapter,
  ) {
    this.register(gls10Adapter);
    this.register(shellyAdapter);
  }

  getAdapter(type: BleGatewayType | null | undefined): GatewayAdapter | null {
    if (!type) {
      return null;
    }
    return this.adapters.get(type) ?? null;
  }

  private register(adapter: GatewayAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }
}
