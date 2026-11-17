import {
  PLUGIN_AUDIT_SYSTEM_PRINCIPAL,
  type PluginAuditActor,
  type PluginAuditPrincipal,
  type PluginAuditReceipt,
  type PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PLUGIN_CONTEXT } from '../plugin-context';

export type DeviceAuditSubject = {
  type: 'matter.node' | 'matter.endpoint' | 'matter.fabric' | 'matter.backup' | 'matter.recovery_key';
  ref: string;
};
export type AuditOutcome = 'succeeded' | 'failed';

/**
 * The host wants a positive safe-integer subject ID. The plugin's stable IDs are UUIDs, so the subject carries a 52-bit
 * number derived from the UUID and the full UUID travels in the details (`nodeRef`, `endpointRef`, `fabricRef`).
 */
export function auditSubjectId(ref: string): number {
  const value = Number.parseInt(ref.replace(/-/g, '').slice(0, 13), 16);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

/**
 * Who an entry is attributed to, whether the action was a system decision (such as reconciliation), and the operation
 * ID its entries share: the entries of one reconciliation run, or of one restore from its check to its outcome.
 */
export type AuditActor = { principal: PluginAuditActor; system: boolean; operationId: string };

/**
 * A user principal, a prepared actor, or null for an action the plugin started itself. Pass the prepared actor on to
 * the steps of one operation, so their entries share its operation ID.
 */
export type AuditBy = PluginAuditPrincipal | AuditActor | null;

/** The user behind `by`, or null for the system. */
export function auditUserId(by: AuditBy): number | null {
  if (by === null) return null;
  if (!isActor(by)) return by.userId;
  return by.system ? null : (by.principal as PluginAuditPrincipal).userId;
}

/** Whether `by` is the plugin itself rather than a user. */
export const isSystemAudit = (by: AuditBy): boolean => auditUserId(by) === null;

/**
 * Records the device model's audit entries. A missing or failing audit sink never fails the operation. Telemetry and
 * state changes the plugin only observed are never audited: only lifecycle decisions and metadata edits.
 */
@Injectable()
export class DeviceAuditService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  /**
   * The actor for an operation. `principal: null` is a system-initiated action such as reconciliation: it is recorded
   * with the system principal, never with a user's. Pass `operationId` to tie the entries to an existing operation.
   */
  actorFor(principal: PluginAuditPrincipal | null, operationId: string = randomUUID()): AuditActor {
    return principal
      ? { principal, system: false, operationId }
      : { principal: PLUGIN_AUDIT_SYSTEM_PRINCIPAL, system: true, operationId };
  }

  /** `by` as an actor: a prepared actor as it is, otherwise a new one with an operation ID of its own. */
  actorOf(by: AuditBy): AuditActor {
    return isActor(by) ? by : this.actorFor(by);
  }

  async record(
    action: string,
    by: AuditBy,
    subject: DeviceAuditSubject,
    details: Record<string, string | number | boolean> = {},
    outcome: AuditOutcome = 'succeeded',
  ): Promise<void> {
    const audit = this.context.audit;
    if (!audit) return;
    const actor = this.actorOf(by);
    try {
      // The host retries a busy database itself. Otherwise `unavailable` means auditing (or the domain) is switched off
      // or the host is shutting down, where a retry would only delay the action.
      const receipt: PluginAuditReceipt = await audit.record({
        action,
        operationId: actor.operationId,
        principal: actor.principal,
        outcome,
        subject: { type: subject.type, id: auditSubjectId(subject.ref) },
        details,
      });
      if (receipt?.status !== 'recorded') {
        this.context.logger.debug?.(`The Matter audit entry ${action} was not recorded.`);
      }
    } catch {
      this.context.logger.warn?.(`Recording the Matter audit entry ${action} failed.`);
    }
  }
}

const isActor = (value: AuditBy): value is AuditActor => value !== null && 'principal' in value;
