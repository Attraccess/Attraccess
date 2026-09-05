import { randomUUID } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, PluginAuditPrincipal, PluginAuditReceipt, PluginContext } from '@attraccess/plugins-backend-sdk';
import { WAGO_PRESETS } from './configuration';

export const WAGO_AUDIT_ACTIONS = [
  'claim', 'unclaim', 'credential_rotation', 'manual_credential_fallback',
  'publication', 'forced_publication', 'rollback', 'rejection_acknowledgement',
  'preset_application', 'preset_reapplication', 'profile_creation', 'profile_change', 'manual_command',
] as const;
export type WagoAuditAction = (typeof WAGO_AUDIT_ACTIONS)[number];

export interface WagoAuditSummary {
  physicalPointCount: number;
  logicalChannelCount: number;
}

/** IDs refer to validated, persisted domain objects; no names, values, snapshots or errors. */
export interface WagoAuditDetails {
  revision?: number;
  sourceRevision?: number;
  profileId?: number;
  profileVersion?: number;
  presetId?: (typeof WAGO_PRESETS)[number]['id'];
  channelId?: string;
  commandId?: string;
  operation?: 'set' | 'pulse';
  result?: 'dispatched' | 'acknowledged' | 'rejected' | 'timeout' | 'transport_failure';
  before?: WagoAuditSummary;
  after?: WagoAuditSummary;
}

/** Integration return contracts for operations implemented by other owners. */
export interface WagoRevisionAuditResult {
  revision: number;
}

export interface WagoPresetAuditResult {
  presetId: NonNullable<WagoAuditDetails['presetId']>;
  channelId: string;
  before: WagoAuditSummary;
  after: WagoAuditSummary;
}

export interface WagoProfileAuditResult {
  profileId: number;
  profileVersion: number;
  before: WagoAuditSummary;
  after: WagoAuditSummary;
}

export interface WagoManualCommandAuditResult {
  commandId: string;
  channelId: string;
  operation: NonNullable<WagoAuditDetails['operation']>;
  result: NonNullable<WagoAuditDetails['result']>;
}

export interface WagoAuditLifecycle {
  readonly operationId: string;
  attempt(): Promise<PluginAuditReceipt>;
  finish(outcome: 'succeeded' | 'failed', details?: WagoAuditDetails): Promise<PluginAuditReceipt>;
}

/** Call only with the Nest guard-authenticated request, never a body-supplied actor. */
export function wagoAuditPrincipal(request: Pick<AuthenticatedRequest, 'user'>): PluginAuditPrincipal {
  const user = request?.user;
  if (!positiveInteger(user?.id)) throw new UnauthorizedException();
  const authenticationMethod = user.authenticationMethod ?? 'session';
  if (!['session', 'api-token'].includes(authenticationMethod)) throw new UnauthorizedException();
  if (authenticationMethod === 'api-token' && !positiveInteger(user.apiTokenId)) throw new UnauthorizedException();
  return {
    userId: user.id,
    authenticationMethod,
    ...(authenticationMethod === 'api-token' ? { apiTokenId: user.apiTokenId } : {}),
  };
}

export function wagoAuditSummary(snapshot: unknown): WagoAuditSummary {
  const value = snapshot as { physicalPoints?: unknown; logicalChannels?: unknown } | null;
  return {
    physicalPointCount: Array.isArray(value?.physicalPoints) ? value.physicalPoints.length : 0,
    logicalChannelCount: Array.isArray(value?.logicalChannels) ? value.logicalChannels.length : 0,
  };
}

/** Projection is also enforced at runtime: TypeScript types alone do not redact JSON. */
export function wagoAuditDetails(input: WagoAuditDetails): Record<string, string | number> {
  const details: Record<string, string | number> = {};
  for (const key of ['revision', 'sourceRevision', 'profileId', 'profileVersion'] as const) {
    if (positiveInteger(input[key])) details[key] = input[key];
  }
  if (WAGO_PRESETS.some((preset) => preset.id === input.presetId)) details.presetId = input.presetId;
  if (typeof input.channelId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(input.channelId)) details.channelId = input.channelId;
  if (typeof input.commandId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.commandId)) details.commandId = input.commandId;
  if (['set', 'pulse'].includes(input.operation)) details.operation = input.operation;
  if (['dispatched', 'acknowledged', 'rejected', 'timeout', 'transport_failure'].includes(input.result)) details.result = input.result;
  for (const side of ['before', 'after'] as const) {
    for (const key of ['physicalPointCount', 'logicalChannelCount'] as const) {
      const count = input[side]?.[key];
      if (Number.isSafeInteger(count) && count >= 0) details[`${side}.${key}`] = count;
    }
  }
  return details;
}

/** A lifecycle belongs to one authenticated administration operation, not a telemetry report. */
export class WagoAudit {
  constructor(private readonly context: Pick<PluginContext, 'audit' | 'logger'>) {}

  async run<T>(
    principal: PluginAuditPrincipal,
    controllerId: number,
    action: WagoAuditAction,
    details: WagoAuditDetails,
    operation: () => Promise<T>,
    completed: (value: T) => WagoAuditDetails = () => ({}),
  ): Promise<T> {
    const lifecycle = this.begin(principal, controllerId, action, details);
    await lifecycle.attempt();
    let value: T;
    try {
      value = await operation();
    } catch (error) {
      await lifecycle.finish('failed');
      throw error;
    }
    await lifecycle.finish('succeeded', completed(value));
    return value;
  }

  /** For owners with asynchronous dispatch/ack lifecycles. Finish exactly once after the true outcome. */
  begin(principal: PluginAuditPrincipal, controllerId: number, action: WagoAuditAction, details: WagoAuditDetails = {}): WagoAuditLifecycle {
    if (!positiveInteger(controllerId) || !WAGO_AUDIT_ACTIONS.includes(action)) throw new BadRequestException('Invalid WAGO audit subject or action');
    const actor = wagoAuditPrincipal({ user: {
      id: principal.userId,
      authenticationMethod: principal.authenticationMethod,
      apiTokenId: principal.apiTokenId,
    } } as Pick<AuthenticatedRequest, 'user'>);
    const operationId = randomUUID();
    const initial = wagoAuditDetails(details);
    let attempted: Promise<PluginAuditReceipt> | undefined;
    let finished: Promise<PluginAuditReceipt> | undefined;
    const record = async (outcome: 'attempted' | 'succeeded' | 'failed', extra: WagoAuditDetails = {}): Promise<PluginAuditReceipt> => {
      let receipt: PluginAuditReceipt;
      try {
        receipt = await this.context.audit?.record({
          action: `wago.${action}`, operationId, principal: { ...actor }, outcome,
          subject: { type: 'wago.controller', id: controllerId },
          details: { ...initial, ...wagoAuditDetails(extra) },
        }) ?? { status: 'unavailable' };
      } catch {
        receipt = { status: 'unavailable' };
      }
      if (receipt.status === 'unavailable') this.context.logger.warn('WAGO audit storage unavailable');
      return receipt;
    };
    const attempt = () => attempted ??= record('attempted');
    return {
      operationId,
      attempt,
      finish: (outcome: 'succeeded' | 'failed', extra: WagoAuditDetails = {}) => finished ??= (async () => {
        await attempt();
        return record(outcome, extra);
      })(),
    };
  }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
