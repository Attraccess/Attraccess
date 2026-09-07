/** Implemented by the generic audit foundation, not by individual plugins. */
export const PLUGIN_AUDIT_HOST_PROVIDER = Symbol.for('attraccess.plugin.auditHostProvider');

export interface PluginAuditPrincipal {
  userId: number;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId?: number;
}

export interface PluginAuditEvent {
  action: string;
  operationId: string;
  principal: PluginAuditPrincipal;
  outcome: 'attempted' | 'succeeded' | 'failed';
  subject: { type: string; id: number };
  /** Callers must project domain data through an explicit allowlist. */
  details: Readonly<Record<string, string | number | boolean | null>>;
}

/** Only `recorded` means the host durably accepted the event. */
export type PluginAuditReceipt = { status: 'recorded' } | { status: 'unavailable' };

export interface PluginAuditContext {
  record(event: PluginAuditEvent): Promise<PluginAuditReceipt>;
}

export interface PluginAuditHostProvider {
  record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt>;
}
