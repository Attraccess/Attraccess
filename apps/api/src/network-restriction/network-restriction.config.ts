import { BadRequestException } from '@nestjs/common';
import {
  NETWORK_RESTRICTION_DEFAULT_HEADER,
  NETWORK_RESTRICTION_HEADER_NAME_PATTERN,
  NetworkIpSource,
  NetworkRestrictedAction,
  NETWORK_RESTRICTED_ACTIONS,
} from '@attraccess/application-models';
import { parseSubnet } from '../cidr-matcher';

export interface NetworkRestrictionConfig {
  enabled: boolean;
  allowedRanges: string[];
  ipSource: NetworkIpSource;
  headerName: string;
}

export const NETWORK_RESTRICTION_DEFAULTS: NetworkRestrictionConfig = {
  enabled: false,
  allowedRanges: [],
  ipSource: NetworkIpSource.Client,
  headerName: NETWORK_RESTRICTION_DEFAULT_HEADER,
};

const MAX_RANGES = 200;
/** The largest role id PostgreSQL can store (int4). */
const MAX_ROLE_ID = 2_147_483_647;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function invalid(message: string): never {
  throw new BadRequestException(message);
}

/** Validates a partial config update strictly (no type coercion) and returns the fields that were given. */
export function parseConfigUpdate(body: unknown): Partial<NetworkRestrictionConfig> {
  if (!isRecord(body)) invalid('The request body must be an object');
  const update: Partial<NetworkRestrictionConfig> = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') invalid('enabled must be a boolean');
    update.enabled = body.enabled;
  }
  if (body.allowedRanges !== undefined) {
    if (!Array.isArray(body.allowedRanges)) invalid('allowedRanges must be a list of IP addresses or CIDR ranges');
    if (body.allowedRanges.length > MAX_RANGES) invalid(`allowedRanges can hold at most ${MAX_RANGES} entries`);
    const ranges: string[] = [];
    for (const entry of body.allowedRanges as unknown[]) {
      if (typeof entry !== 'string' || !parseSubnet(entry)) {
        invalid(`Invalid IP address or CIDR range: ${JSON.stringify(entry)}`);
      }
      const trimmed = (entry as string).trim();
      if (!ranges.includes(trimmed)) ranges.push(trimmed);
    }
    update.allowedRanges = ranges;
  }
  if (body.ipSource !== undefined) {
    if (body.ipSource !== NetworkIpSource.Client && body.ipSource !== NetworkIpSource.Header) {
      invalid(`ipSource must be "${NetworkIpSource.Client}" or "${NetworkIpSource.Header}"`);
    }
    update.ipSource = body.ipSource;
  }
  if (body.headerName !== undefined) {
    if (typeof body.headerName !== 'string' || !NETWORK_RESTRICTION_HEADER_NAME_PATTERN.test(body.headerName.trim())) {
      invalid(`Invalid header name: ${JSON.stringify(body.headerName)}`);
    }
    update.headerName = body.headerName.trim();
  }
  return update;
}

/** An enabled restriction needs at least one allowed range, otherwise nobody would be inside. */
export function assertConsistent(config: NetworkRestrictionConfig): void {
  if (config.enabled && config.allowedRanges.length === 0) {
    invalid('allowedRanges must not be empty while the network restriction is enabled');
  }
}

export interface RoleActionsUpdate {
  roleId: number;
  actions: NetworkRestrictedAction[];
}

/** Validates `{ roles: [{ roleId, actions }] }`; an unknown action key or a repeated role is a 400. */
export function parseRoleActionsUpdate(body: unknown): RoleActionsUpdate[] {
  if (!isRecord(body) || !Array.isArray(body.roles)) invalid('roles must be a list');
  const seen = new Set<number>();
  return (body.roles as unknown[]).map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.roleId !== 'number' ||
      !Number.isInteger(entry.roleId) ||
      entry.roleId < 1 ||
      entry.roleId > MAX_ROLE_ID
    ) {
      invalid('Every role entry needs a positive integer roleId');
    }
    if (!Array.isArray(entry.actions)) invalid('Every role entry needs a list of actions');
    const roleId = entry.roleId as number;
    if (seen.has(roleId)) invalid(`Role ${roleId} is listed more than once`);
    seen.add(roleId);
    const actions: NetworkRestrictedAction[] = [];
    for (const action of entry.actions as unknown[]) {
      if (!(NETWORK_RESTRICTED_ACTIONS as readonly unknown[]).includes(action)) {
        invalid(`Unknown action: ${JSON.stringify(action)}`);
      }
      if (!actions.includes(action as NetworkRestrictedAction)) actions.push(action as NetworkRestrictedAction);
    }
    return { roleId, actions };
  });
}
