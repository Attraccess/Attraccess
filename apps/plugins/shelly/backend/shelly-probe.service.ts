// Device probe: detects a Shelly's generation and model from its unauthenticated
// `GET /shelly` endpoint, which every Shelly device exposes.
//
//   Gen1 responds:   { "type": "SHSW-25", "mac": "...", "auth": false, ... }
//   Gen2+ responds:  { "id": "...", "model": "SNSW-001P16EU", "gen": 2,
//                      "auth_en": false, ... }
//
// The presence of a numeric `gen` field is the discriminator between the two.
import { Injectable } from '@nestjs/common';
import type { AuthState, ProbeResult } from './types';

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

    return this.interpret(json);
  }

  private interpret(json: ShellyInfoResponse): ProbeResult {
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
