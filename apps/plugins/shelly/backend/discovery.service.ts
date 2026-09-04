// Auto-discovery of Shelly devices on the LAN (ATT-497).
//
// Two sources, merged:
//  1. mDNS `_shelly._tcp` — instant and zero-config, but only works when the API
//     shares a broadcast domain with the devices (i.e. host networking).
//  2. Subnet scan — probes every host of a CIDR. This is the path that works
//     from a Docker bridge network, where multicast is dead but outbound HTTP to
//     the LAN is routed fine; the operator supplies their LAN CIDR.
//
// Every candidate from either source is confirmed by the same `GET /shelly`
// probe used for manual adds, so a device only lands in the registry if it
// really is a Shelly. Known IPs are refreshed rather than duplicated.
//
// Both sources are IP-based, so this only ever finds WiFi devices. Zigbee-only
// Shellys have no IP of their own and are discovered through zigbee2mqtt's
// `bridge/devices` topic instead — out of scope here, see ATT-789.
import { Inject, Injectable } from '@nestjs/common';
import { DeviceRegistryService } from './device-registry.service';
import { discoverViaMdns } from './mdns-discovery';
import { expandCidr, isPrivateIpv4, localScanTargets } from './network-scan';
import { SCAN_PROBE_TIMEOUT_MS, ShellyProbeService } from './shelly-probe.service';
import type { AuthState } from './types';

/** Simultaneous in-flight probes. Chosen so a /24 completes in a few seconds. */
const SCAN_CONCURRENCY = 64;

export interface DiscoveredDevice {
  deviceId: number;
  ipAddress: string;
  name: string;
  generation: number;
  model: string | null;
  authState: AuthState;
  /** True when this run added the device; false when it was already registered. */
  isNew: boolean;
  /** Which source turned the address up first. */
  source: 'mdns' | 'scan';
}

export interface DiscoveryResult {
  /** CIDRs actually scanned (empty when discovery ran mDNS-only). */
  subnets: string[];
  /** Number of addresses probed, across both sources. */
  probed: number;
  devices: DiscoveredDevice[];
}

/** Runs `worker` over `items`, at most `limit` at a time. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(DeviceRegistryService) private readonly registry: DeviceRegistryService,
    @Inject(ShellyProbeService) private readonly probe: ShellyProbeService,
  ) {}

  /**
   * Discovers devices and writes them to the registry.
   *
   * @param cidr Subnet to scan. Omitted, the host's own private networks are
   *   used — which finds nothing on a Docker bridge network (its /16 is skipped
   *   as too large), so containerised installs are expected to pass one.
   */
  async discover(cidr?: string): Promise<DiscoveryResult> {
    const subnets = cidr ? [cidr] : localScanTargets();
    // expandCidr throws on an invalid/oversized/public CIDR — let it propagate
    // so the operator gets the reason instead of a silent empty result.
    const scanTargets = subnets.flatMap((subnet) => expandCidr(subnet));

    // A record in an mDNS reply is attacker-controllable, so it gets the same
    // private-range check the scan path enforces — otherwise a rogue responder
    // could point our probe at any address it likes.
    const mdnsAddresses = (await discoverViaMdns()).filter(isPrivateIpv4);
    const seen = new Set(mdnsAddresses);
    const candidates: { ipAddress: string; source: 'mdns' | 'scan' }[] = mdnsAddresses.map((ipAddress) => ({
      ipAddress,
      source: 'mdns',
    }));
    for (const ipAddress of scanTargets) {
      if (seen.has(ipAddress)) continue;
      seen.add(ipAddress);
      candidates.push({ ipAddress, source: 'scan' });
    }

    const hits = (
      await mapWithConcurrency(candidates, SCAN_CONCURRENCY, async (candidate) => {
        try {
          const result = await this.probe.probe(candidate.ipAddress, SCAN_PROBE_TIMEOUT_MS);
          return { ...candidate, result };
        } catch {
          // Unreachable, not a Shelly, or too slow — all equally "not found".
          return null;
        }
      })
    ).filter((hit): hit is NonNullable<typeof hit> => hit !== null);

    const devices: DiscoveredDevice[] = [];
    // Registry writes are sequential: a scan turns up a handful of devices at
    // most, and serialising keeps the find-then-create check race-free.
    for (const hit of hits) {
      devices.push(await this.persist(hit.ipAddress, hit.source, hit.result));
    }

    return { subnets, probed: candidates.length, devices };
  }

  private async persist(
    ipAddress: string,
    source: 'mdns' | 'scan',
    result: { generation: number; model: string | null; authState: AuthState },
  ): Promise<DiscoveredDevice> {
    const probeFields = {
      generation: result.generation,
      model: result.model,
      authState: result.authState,
      lastProbeAt: new Date().toISOString(),
      lastProbeError: null,
    };

    const existing = await this.registry.findByIp(ipAddress);
    if (existing) {
      // Refresh what the probe just told us, but leave the operator's name alone.
      await this.registry.updateProbe(existing.id, probeFields);
      return { deviceId: existing.id, ipAddress, name: existing.name, ...result, isNew: false, source };
    }

    const name = result.model ? `${result.model} (${ipAddress})` : ipAddress;
    const created = await this.registry.create({ name, ipAddress, ...probeFields });
    return { deviceId: created.id, ipAddress, name, ...result, isNew: true, source };
  }
}
