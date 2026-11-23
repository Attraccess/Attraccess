import { Injectable } from '@nestjs/common';
import { NetworkIpSource } from '@attraccess/application-models';
import { createCidrMatcher } from '../cidr-matcher';
import { SettingsStoreService } from '../settings/settings-store.service';
import {
  assertConsistent,
  NETWORK_RESTRICTION_DEFAULTS,
  NetworkRestrictionConfig,
  parseConfigUpdate,
} from './network-restriction.config';

const PARENT = 'network_restriction';
const KEYS = {
  enabled: 'enabled',
  allowedRanges: 'allowed_ranges',
  ipSource: 'ip_source',
  headerName: 'header_name',
} as const;

function parseRanges(stored: string | null): string[] {
  try {
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

/** The stored network restriction settings. Reads go through the settings cache; a save updates it at once. */
@Injectable()
export class NetworkRestrictionConfigService {
  private matcher?: { key: string; matches: (address: string) => boolean };

  constructor(private readonly store: SettingsStoreService) {}

  async get(): Promise<NetworkRestrictionConfig> {
    const [enabled, ranges, source, header] = await Promise.all([
      this.store.getPlainSetting(PARENT, KEYS.enabled),
      this.store.getPlainSetting(PARENT, KEYS.allowedRanges),
      this.store.getPlainSetting(PARENT, KEYS.ipSource),
      this.store.getPlainSetting(PARENT, KEYS.headerName),
    ]);
    return {
      enabled: enabled === 'true',
      allowedRanges: parseRanges(ranges),
      ipSource: source === NetworkIpSource.Header ? NetworkIpSource.Header : NETWORK_RESTRICTION_DEFAULTS.ipSource,
      headerName: header ?? NETWORK_RESTRICTION_DEFAULTS.headerName,
    };
  }

  /** Validates the update against the stored config and stores the merged result. Throws a 400 for bad input. */
  async update(body: unknown): Promise<NetworkRestrictionConfig> {
    const update = parseConfigUpdate(body);
    const merged = { ...(await this.get()), ...update };
    assertConsistent(merged);
    await Promise.all([
      this.store.setPlainSetting(PARENT, KEYS.enabled, String(merged.enabled)),
      this.store.setPlainSetting(PARENT, KEYS.allowedRanges, JSON.stringify(merged.allowedRanges)),
      this.store.setPlainSetting(PARENT, KEYS.ipSource, merged.ipSource),
      this.store.setPlainSetting(PARENT, KEYS.headerName, merged.headerName),
    ]);
    return merged;
  }

  /** True when the address lies in one of the allowed ranges. Compiled once per list of ranges. */
  isInside(config: NetworkRestrictionConfig, address: string | null): boolean {
    if (address === null) return false;
    const key = JSON.stringify(config.allowedRanges);
    if (this.matcher?.key !== key) this.matcher = { key, matches: createCidrMatcher(config.allowedRanges) };
    return this.matcher.matches(address);
  }
}
