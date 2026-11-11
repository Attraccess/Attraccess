import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MatterConnection, CONNECTION_ROW_ID } from '../connection/entity';
import { PLUGIN_CONTEXT } from '../plugin-context';

export type DeviceAuditSubject = { type: 'matter.node' | 'matter.endpoint' | 'matter.fabric'; ref: string };

/**
 * The host wants a positive integer subject ID. The plugin's stable IDs are UUIDs, so the subject carries a 28-bit
 * number derived from the UUID and the full UUID travels in the details (`nodeRef`, `endpointRef`, `fabricRef`).
 */
export function auditSubjectId(ref: string): number {
  const value = Number.parseInt(ref.replace(/-/g, '').slice(0, 7), 16);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

/**
 * Records the device model's audit entries. A missing or failing audit sink never fails the operation. Telemetry is
 * never audited: only lifecycle decisions and metadata edits.
 */
@Injectable()
export class DeviceAuditService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  /**
   * `principal: null` is a system-initiated action such as reconciliation. The host accepts only real user IDs, so
   * those are attributed to the administrator who last saved the connection settings.
   */
  async record(
    action: string,
    principal: PluginAuditPrincipal | null,
    subject: DeviceAuditSubject,
    details: Record<string, string | number | boolean> = {},
  ): Promise<void> {
    const audit = this.context.audit;
    if (!audit) return;
    try {
      const actor = principal ?? (await this.systemPrincipal());
      if (!actor) {
        this.context.logger.warn?.(
          'A Matter audit entry was skipped: no administrator to attribute a system action to.',
        );
        return;
      }
      await audit.record({
        action,
        operationId: randomUUID(),
        principal: actor,
        outcome: 'succeeded',
        subject: { type: subject.type, id: auditSubjectId(subject.ref) },
        details,
      });
    } catch {
      this.context.logger.warn?.('Recording a Matter device change in the audit log failed.');
    }
  }

  private async systemPrincipal(): Promise<PluginAuditPrincipal | null> {
    const row = await this.context.getRepository(MatterConnection).findOneBy({ id: CONNECTION_ROW_ID });
    return row?.updatedBy ? { userId: row.updatedBy, authenticationMethod: 'session' } : null;
  }
}
