// Device probe: detects a Shelly's generation and model from its unauthenticated
// `GET /shelly` endpoint, which every Shelly device exposes.
//
//   Gen1 responds:   { "type": "SHSW-25", "mac": "...", "auth": false, ... }
//   Gen2+ responds:  { "id": "...", "model": "SNSW-001P16EU", "gen": 2,
//                      "auth_en": false, ... }
//
// The presence of a numeric `gen` field is the discriminator between the two.
//
// `GET /shelly` carries no radio/capability flags, so Zigbee capability (ATT-789)
// is detected separately by calling `Zigbee.GetConfig` and treating a
// method-not-found response as "not Zigbee-capable" — the most robust signal
// available, since `Shelly.ListMethods` is ACL-filtered and needs auth.
import { Injectable } from '@nestjs/common';
import type { AuthState, ProbeResult, ZigbeeCapability, ZigbeeNetworkState } from './types';

const PROBE_TIMEOUT_MS = 5000;
/** Shorter budget for scans, where most addresses are dead and probed in bulk. */
export const SCAN_PROBE_TIMEOUT_MS = 1000;

/** Loosely-typed shape of the `GET /shelly` response across generations. */
interface ShellyInfoResponse {
  // Gen2+
  gen?: number;
  model?: string;
  auth_en?: boolean;
  // Gen1
  type?: string;
  auth?: boolean;
}

@Injectable()
export class ShellyProbeService {
  /**
   * Probes `http://<ipAddress>/shelly` and interprets the response. Throws an
   * Error with a human-readable message if the device is unreachable or returns
   * a non-OK / non-JSON response.
   */
  async probe(ipAddress: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    const url = `http://${ipAddress}/shelly`;
    let json: ShellyInfoResponse;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`device responded HTTP ${res.status}`);
      }
      json = (await res.json()) as ShellyInfoResponse;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`probe of ${url} failed: ${reason}`);
    }

    const base = this.interpret(json);
    // Only Gen2+ has an RPC endpoint at all, and only Gen4 has a Zigbee radio —
    // asking a Gen1 would just be a wasted request against a device that would
    // 404 anyway.
    const zigbee = base.generation >= 2 ? await this.probeZigbee(ipAddress, timeoutMs) : null;
    return { ...base, zigbee };
  }

  /**
   * Detects the Zigbee radio via RPC. Returns null when the answer is unknown
   * (transport failure) so callers keep whatever they knew before, rather than
   * recording a transient timeout as "not Zigbee-capable".
   */
  private async probeZigbee(ipAddress: string, timeoutMs: number): Promise<ZigbeeCapability | null> {
    let config: { enable?: boolean };
    try {
      const res = await fetch(`http://${ipAddress}/rpc/Zigbee.GetConfig`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        // A Gen2/Gen3 without the component answers 404 "Method not found" — a
        // definitive no, unlike a 401 (auth) or 5xx (device trouble).
        return res.status === 404 || res.status === 501
          ? { capable: false, enabled: false, networkState: null }
          : null;
      }
      config = (await res.json()) as { enable?: boolean };
    } catch {
      return null;
    }

    return {
      capable: true,
      enabled: config.enable === true,
      networkState: await this.probeZigbeeNetworkState(ipAddress, timeoutMs),
    };
  }

  private async probeZigbeeNetworkState(ipAddress: string, timeoutMs: number): Promise<ZigbeeNetworkState | null> {
    try {
      const res = await fetch(`http://${ipAddress}/rpc/Zigbee.GetStatus`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const status = (await res.json()) as { network_state?: string };
      return (status.network_state as ZigbeeNetworkState | undefined) ?? null;
    } catch {
      return null;
    }
  }

  private interpret(json: ShellyInfoResponse): Omit<ProbeResult, 'zigbee'> {
    if (typeof json.gen === 'number') {
      // Gen2+: model + auth_en are first-class fields.
      const authState: AuthState = json.auth_en === true ? 'required' : 'none';
      return { generation: json.gen, model: json.model ?? null, authState, raw: json };
    }
    // Gen1: the model lives in `type`, auth in the boolean `auth`.
    const authState: AuthState = json.auth === true ? 'required' : 'none';
    return { generation: 1, model: json.type ?? null, authState, raw: json };
  }
}
