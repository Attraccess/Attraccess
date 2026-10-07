import { WAGO_PRESETS } from './configuration';
import { positiveInteger } from './wago-audit.helpers';
import type { WagoAuditSummary } from './wago-audit.wago-audit-summary';

/** Projection is also enforced at runtime: TypeScript types alone do not redact JSON. */
export function wagoAuditDetails(input: WagoAuditDetails): Record<string, string | number> {
  const details: Record<string, string | number> = {};
  for (const key of ['revision', 'sourceRevision'] as const) {
    if (positiveInteger(input[key])) details[key] = input[key];
  }
  if (typeof input.profileId === 'string' && input.profileId.length <= 160 && input.profileId.trim())
    details.profileId = input.profileId;
  if (positiveInteger(input.profileVersion) && input.profileVersion <= 1_000_000)
    details.profileVersion = input.profileVersion;
  if (WAGO_PRESETS.some((preset) => preset.id === input.presetId)) details.presetId = input.presetId;
  if (typeof input.channelId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(input.channelId))
    details.channelId = input.channelId;
  if (
    typeof input.commandId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.commandId)
  )
    details.commandId = input.commandId;
  if (['set', 'pulse', 'release'].includes(input.operation)) details.operation = input.operation;
  if (['dispatched', 'acknowledged', 'rejected', 'timeout', 'transport_failure'].includes(input.result))
    details.result = input.result;
  for (const side of ['before', 'after'] as const) {
    for (const key of ['physicalPointCount', 'logicalChannelCount'] as const) {
      const count = input[side]?.[key];
      if (Number.isSafeInteger(count) && count >= 0) details[`${side}.${key}`] = count;
    }
  }
  return details;
}
export interface WagoAuditDetails {
  revision?: number;
  sourceRevision?: number;
  profileId?: string;
  profileVersion?: number;
  presetId?: (typeof WAGO_PRESETS)[number]['id'];
  channelId?: string;
  commandId?: string;
  operation?: 'set' | 'pulse' | 'release';
  result?: 'dispatched' | 'acknowledged' | 'rejected' | 'timeout' | 'transport_failure';
  before?: WagoAuditSummary;
  after?: WagoAuditSummary;
}
