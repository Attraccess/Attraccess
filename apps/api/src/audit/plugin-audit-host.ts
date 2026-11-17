import {
  isPluginAuditSystemPrincipal,
  PluginAuditEvent,
  PluginAuditHostProvider,
  PluginAuditPrincipal,
  PluginAuditReceipt,
} from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { projectPluginAuditEvent } from './policies/plugins';
import {
  AUDIT_RECORDER,
  AuditActor,
  AuditRecorder,
  PluginAuditDomainName,
  SYSTEM_AUDIT_ACTOR,
} from './recorder/audit-event';

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
    // A malformed principal (for example a system principal with extra fields) fails the projection, so the
    // recorder drops the event as invalid whichever actor it carries.
    const actor: AuditActor = isPluginAuditSystemPrincipal(principal)
      ? SYSTEM_AUDIT_ACTOR
      : userActor(principal as PluginAuditPrincipal | undefined);
    return this.recorder.record({
      domain: (projected?.domain ?? '') as PluginAuditDomainName,
      action: event?.action,
      operationId: event?.operationId,
      actor,
      outcome: event?.outcome,
      subject: event?.subject,
      details: event?.details as Record<string, string | number | boolean | null>,
    });
  }
}

function userActor(principal: PluginAuditPrincipal | undefined): AuditActor {
  return {
    id: principal?.userId,
    authenticationMethod: principal?.authenticationMethod,
    ...(principal?.apiTokenId === undefined ? {} : { apiTokenId: principal.apiTokenId }),
  };
}
