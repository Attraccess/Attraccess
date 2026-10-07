import { AuditLog } from '@attraccess/database-entities';
import { PluginAuditEvent, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { getPluginAuditDomain } from '../plugin-system/plugin-audit-registry';
import { AuditDomainCaptureImplementation } from './audit-domain-capture';
import { AuditSettings, readAuditSettings } from './audit.config';
import { SQLITE_CONTENTION_RECOVERY_DELAY_MS } from './audit.service.route-context';
import { projectPluginAuditEvent } from './plugin-audit-policy';
export abstract class AuditCaptureStorageImplementation extends AuditDomainCaptureImplementation {
  /** Host bridge for plugin audit events: validated against the recording plugin's registered domain declaration. */
  async record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectPluginAuditEvent(event);
      if (!snapshot) return { status: 'unavailable' };
      return await this.recordSnapshot({
        domain: snapshot.domain,
        pluginId: snapshot.pluginId,
        action: snapshot.action,
        operationId: snapshot.operationId,
        actorId: snapshot.actorId,
        authenticationMethod: snapshot.authenticationMethod,
        apiTokenId: snapshot.apiTokenId ?? null,
        outcome: snapshot.outcome,
        subjectType: snapshot.subjectType,
        subjectId: snapshot.subjectId,
        ipAddress: null,
        userAgent: null,
        details: snapshot.details,
      });
    } catch {
      // Never log the event, SQLite parameters, or exception (may contain secrets).
      return { status: 'unavailable' };
    }
  }

  protected async recordSnapshot(
    event: Omit<AuditLog, 'id' | 'at'>,
    finalSettingsChange = false,
  ): Promise<PluginAuditReceipt> {
    if (this.stopping || !this.storage?.isInitialized || this.pending >= 8) return { status: 'unavailable' };
    if (this.source.createQueryRunner().isTransactionActive) return { status: 'unavailable' };
    this.pending++;
    try {
      const config = await readAuditSettings(this.settings);
      if ((!finalSettingsChange && (!config.enabled || !this.domainEnabled(config, event.domain))) || this.stopping)
        return { status: 'unavailable' };
      const unavailable = await this.serializeStorageWrite<PluginAuditReceipt | undefined>(async () => {
        if (this.contended) {
          // Drop the already-admitted burst, then give the first later write a short chance
          // to observe a released SQLite lock without reviving the whole stale burst.
          if (this.pending > 1) return { status: 'unavailable' };
          await new Promise<void>((resolve) => setTimeout(resolve, SQLITE_CONTENTION_RECOVERY_DELAY_MS));
          this.contended = false;
        }
        try {
          await this.storage.getRepository(AuditLog).insert({ at: new Date(), ...event });
        } catch {
          this.contended = true;
          return { status: 'unavailable' };
        }
      });
      if (unavailable) return unavailable;
      return { status: 'recorded' };
    } finally {
      this.pending--;
    }
  }

  /** Serializes every write on the audit storage connection, including cleanup transactions. */
  protected async serializeStorageWrite<T>(write: () => Promise<T>): Promise<T> {
    const precedingWrite = this.writeTail;
    let releaseWrite!: () => void;
    this.writeTail = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    try {
      await precedingWrite;
      return await write();
    } finally {
      releaseWrite();
    }
  }

  /** Core domains follow the configured allowlist; plugin domains record while registered unless explicitly disabled. */
  protected domainEnabled(config: AuditSettings, domain: string): boolean {
    return getPluginAuditDomain(domain) !== undefined
      ? !config.plugin_domains_disabled.includes(domain)
      : (config.domains as readonly string[]).includes(domain);
  }

  protected cutoff(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 86_400_000);
  }

  protected sqliteDate(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }
}
