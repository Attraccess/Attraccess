import type { PluginAuditPrincipal, PluginAuditReceipt, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MatterConnection, CONNECTION_ROW_ID } from '../connection/entity';
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

/** Who an entry is attributed to, and whether the action was a system decision (such as reconciliation). */
export type AuditActor = { principal: PluginAuditPrincipal; system: boolean };

/**
 * Records the device model's audit entries. A missing or failing audit sink never fails the operation. Telemetry is
 * never audited: only lifecycle decisions and metadata edits.
 */
@Injectable()
export class DeviceAuditService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  /**
   * The actor for a run. `principal: null` is a system-initiated action such as reconciliation. The host accepts only
   * real user IDs, so those are attributed to the administrator who last saved the connection settings, and their
   * details say `initiator: 'system'`. Returns null (entries are skipped) when there is no such administrator.
   */
  async actorFor(principal: PluginAuditPrincipal | null): Promise<AuditActor | null> {
    if (principal) return { principal, system: false };
    try {
      const row = await this.context.getRepository(MatterConnection).findOneBy({ id: CONNECTION_ROW_ID });
      if (row?.updatedBy)
        return { principal: { userId: row.updatedBy, authenticationMethod: 'session' }, system: true };
    } catch {
      // Reported below like a missing administrator.
    }
    this.context.logger.warn?.('Matter audit entries were skipped: no administrator to attribute a system action to.');
    return null;
  }

  async record(
    action: string,
    principal: PluginAuditPrincipal | AuditActor | null,
    subject: DeviceAuditSubject,
    details: Record<string, string | number | boolean> = {},
    outcome: AuditOutcome = 'succeeded',
  ): Promise<void> {
    const audit = this.context.audit;
    if (!audit) return;
    const actor = isActor(principal) ? principal : await this.actorFor(principal);
    if (!actor) return;
    try {
      // The host retries a busy database itself. Otherwise `unavailable` means auditing (or the domain) is switched off
      // or the host is shutting down, where a retry would only delay the action.
      const receipt: PluginAuditReceipt = await audit.record({
        action,
        operationId: randomUUID(),
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

const isActor = (value: PluginAuditPrincipal | AuditActor | null): value is AuditActor =>
  value !== null && 'principal' in value;
