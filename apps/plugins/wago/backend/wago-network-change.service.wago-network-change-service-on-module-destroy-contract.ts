import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoNetworkChange } from './wago-network-change.entity';
import { WagoController } from './wago-controller.entity';
import { NetworkPayload } from './wago-network-change.service.network-payload';

export abstract class WagoNetworkChangeServiceOnModuleDestroyContract {
  abstract onModuleDestroy(): void;
  abstract retirePreviousCredentials(
    controllerId: number,
    principal: PluginAuditPrincipal,
  ): Promise<{
    available: boolean;
    targetHost: string | null;
    mqttServerId: WagoController['mqttServerId'];
    pendingCredentialRetirements: number;
    operation: {
      targetHost: WagoNetworkChange['targetHost'];
      mqttServerId: WagoController['mqttServerId'];
      phase: WagoNetworkChange['phase'];
      failure: WagoNetworkChange['failure'];
      running: boolean;
    } | null;
  }>;
  abstract status(controllerId: number): Promise<{
    available: boolean;
    targetHost: string | null;
    mqttServerId: WagoController['mqttServerId'];
    pendingCredentialRetirements: number;
    operation: {
      targetHost: WagoNetworkChange['targetHost'];
      mqttServerId: WagoController['mqttServerId'];
      phase: WagoNetworkChange['phase'];
      failure: WagoNetworkChange['failure'];
      running: boolean;
    } | null;
  }>;
  abstract apply(
    controllerId: number,
    body: unknown,
    principal: PluginAuditPrincipal,
    retry?: boolean,
  ): Promise<{
    available: boolean;
    targetHost: string | null;
    mqttServerId: WagoController['mqttServerId'];
    pendingCredentialRetirements: number;
    operation: {
      targetHost: WagoNetworkChange['targetHost'];
      mqttServerId: WagoController['mqttServerId'];
      phase: WagoNetworkChange['phase'];
      failure: WagoNetworkChange['failure'];
      running: boolean;
    } | null;
  }>;
  protected abstract phase(
    row: WagoNetworkChange,
    phase: WagoNetworkChange['phase'],
    assertOwned: () => Promise<void>,
  ): Promise<void>;
  protected abstract brokerConnection(
    mqttServerId: number,
  ): Promise<{ url: string; tlsInsecure: boolean; tlsServername: string; caCert: string }>;
  protected abstract payload(row: WagoNetworkChange, controller: WagoController): NetworkPayload;
  protected abstract saveBindings(
    row: WagoNetworkChange,
    encryptedCredentials: string,
    payload: NetworkPayload | null,
    assertOwned: () => Promise<void>,
  ): Promise<void>;
  protected abstract evidence(
    payload: NetworkPayload,
    signal: AbortSignal,
  ): Promise<{ wait: () => Promise<void>; close: () => void }>;
}
