import { PluginAuditEvent, PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { projectPluginAuditEvent } from './policies/plugins';
import { AUDIT_RECORDER, AuditRecorder, PluginAuditDomainName } from './recorder/audit-event';

/**
 * Host side of the plugin SDK's audit context. Maps a plugin event onto the audit envelope and records it through
 * the same recorder as core code. The plugin's own event shape is checked first (closed keys, a domain the
 * recording plugin owns); an event that fails it reaches the recorder without a domain and is dropped as invalid,
 * counted under the `unknown` domain as before.
 */
@Injectable()
export class PluginAuditHost implements PluginAuditHostProvider {
  constructor(@Inject(AUDIT_RECORDER) private readonly recorder: AuditRecorder) {}

  async record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt> {
    const projected = projectPluginAuditEvent(event);
    const principal = event?.principal;
    return this.recorder.record({
      domain: (projected?.domain ?? '') as PluginAuditDomainName,
      action: event?.action,
      operationId: event?.operationId,
      actor: {
        id: principal?.userId,
        authenticationMethod: principal?.authenticationMethod,
        ...(principal?.apiTokenId === undefined ? {} : { apiTokenId: principal.apiTokenId }),
      },
      outcome: event?.outcome,
      subject: event?.subject,
      details: event?.details as Record<string, string | number | boolean | null>,
    });
  }
}
