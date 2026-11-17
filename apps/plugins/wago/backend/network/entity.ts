import type { WagoMqttCredentialRetirementRow, WagoNetworkChangePhase, WagoNetworkChangeRow } from '../storage';

export type { WagoNetworkChangePhase };
/** Durable roll-forward intent. Only an explicit public projection may leave the backend. */
export type WagoNetworkChange = WagoNetworkChangeRow;
/** The old identity's broker association, retained when it cannot be contacted. */
export type WagoMqttCredentialRetirement = WagoMqttCredentialRetirementRow;
