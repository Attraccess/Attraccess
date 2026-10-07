import { AuditLog } from '@attraccess/database-entities';
import { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'crypto';
import {
  AdministrationAuditEvent,
  PreviousAuditSettings,
  projectAdministrationAuditEvent,
} from './audit-administration-policy';
import {
  ProjectAuditEvent,
  projectProjectAuditEvent,
  projectResourceAuditEvent,
  ResourceAuditEvent,
} from './audit-policy';
import { readAuditSettings } from './audit.config';
import { billingSources, billingStatuses, BillingTransactionAuditEvent } from './audit.service.route-context';
import { AuditServiceRouteContext } from './audit.service.route-context';
export abstract class AuditDomainCaptureImplementation extends AuditServiceRouteContext {
  /** Billing events are projected from scalar transaction fields only, never provider payloads. */
  async recordBillingTransaction(event: BillingTransactionAuditEvent): Promise<PluginAuditReceipt> {
    try {
      if (
        !Number.isSafeInteger(event.transactionId) ||
        event.transactionId <= 0 ||
        !Number.isSafeInteger(event.userId) ||
        event.userId <= 0 ||
        !Number.isSafeInteger(event.amount) ||
        !billingStatuses.has(event.status) ||
        (event.previousStatus !== undefined && !billingStatuses.has(event.previousStatus)) ||
        !billingSources.has(event.source)
      )
        return { status: 'unavailable' };
      const actorId = event.initiatorId ?? event.userId;
      if (!Number.isSafeInteger(actorId) || actorId <= 0) return { status: 'unavailable' };
      return await this.recordSnapshot({
        domain: 'billing',
        pluginId: 'billing',
        action: event.previousStatus === undefined ? 'billing.transaction.created' : 'billing.transaction.updated',
        operationId: `billing-transaction-${event.transactionId}`,
        actorId,
        authenticationMethod: 'session',
        apiTokenId: null,
        outcome: 'succeeded',
        subjectType: 'billing.transaction',
        subjectId: event.transactionId,
        ipAddress: null,
        userAgent: null,
        details: {
          amount: event.amount,
          status: event.status,
          ...(event.previousStatus === undefined ? {} : { previousStatus: event.previousStatus }),
          source: event.source,
        },
      });
    } catch {
      return { status: 'unavailable' };
    }
  }

  async recordResource(event: Omit<ResourceAuditEvent, 'operationId'>): Promise<boolean> {
    try {
      const snapshot = projectResourceAuditEvent({ ...event, operationId: randomUUID() });
      const storage = this.storage;
      if (!snapshot || this.stopping || !storage?.isInitialized || this.pending >= 8) return false;
      this.pending++;
      try {
        const config = await readAuditSettings(this.settings);
        if (!config.enabled || !config.domains.includes('resource') || this.stopping) return false;
        await this.serializeStorageWrite(() =>
          storage.getRepository(AuditLog).insert({
            at: new Date(),
            domain: 'resource',
            pluginId: 'core',
            action: snapshot.action,
            operationId: snapshot.operationId,
            actorId: snapshot.actorId,
            authenticationMethod:
              snapshot.authenticationMethod === undefined
                ? snapshot.actorId === null
                  ? null
                  : 'session'
                : snapshot.authenticationMethod,
            apiTokenId: snapshot.apiTokenId ?? null,
            outcome: 'succeeded',
            subjectType: snapshot.subjectType ?? 'resource',
            subjectId: snapshot.subjectId,
            ipAddress: null,
            userAgent: null,
            details: snapshot.details,
          }),
        );
        return true;
      } finally {
        this.pending--;
      }
    } catch {
      /* Audit persistence must not affect resource operations. */
      return false;
    }
  }

  /** Records only reviewed scalar administration metadata; callers must never pass request bodies. */
  async recordAdministration(
    event: AdministrationAuditEvent,
    previousAuditSettings?: PreviousAuditSettings,
  ): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectAdministrationAuditEvent(event);
      if (!snapshot) return { status: 'unavailable' };
      // A successful change that turns recording off is its own final event. The exception
      // is restricted to audit settings and the caller's previously enabled administration policy.
      const finalSettingsChange =
        snapshot.action === 'settings.updated' &&
        String(snapshot.details.settingKey).startsWith('audit.') &&
        previousAuditSettings?.enabled === true &&
        previousAuditSettings.domains.includes('administration');
      return await this.recordSnapshot(
        {
          domain: 'administration',
          pluginId: 'core',
          action: snapshot.action,
          operationId: snapshot.operationId ?? randomUUID(),
          actorId: snapshot.actorId,
          authenticationMethod: snapshot.authenticationMethod ?? 'session',
          apiTokenId: snapshot.apiTokenId ?? null,
          outcome: snapshot.outcome ?? 'succeeded',
          subjectType: snapshot.subjectType,
          subjectId: snapshot.subjectId,
          details: snapshot.details,
          ipAddress: null,
          userAgent: null,
        },
        finalSettingsChange,
      );
    } catch {
      // Audit persistence must not affect administration operations.
      return { status: 'unavailable' };
    }
  }

  async recordProject(event: Omit<ProjectAuditEvent, 'operationId'>): Promise<void> {
    try {
      const snapshot = projectProjectAuditEvent({ ...event, operationId: randomUUID() });
      const storage = this.storage;
      if (!snapshot || this.stopping || !storage?.isInitialized || this.pending >= 8) return;
      this.pending++;
      try {
        const config = await readAuditSettings(this.settings);
        if (!config.enabled || !config.domains.includes('project') || this.stopping) return;
        await this.serializeStorageWrite(() =>
          storage.getRepository(AuditLog).insert({
            at: new Date(),
            domain: 'project',
            pluginId: 'core',
            action: snapshot.action,
            operationId: snapshot.operationId,
            actorId: snapshot.actorId,
            authenticationMethod: snapshot.authenticationMethod ?? 'session',
            apiTokenId: snapshot.apiTokenId ?? null,
            outcome: 'succeeded',
            subjectType: snapshot.subjectType,
            subjectId: snapshot.subjectId,
            ipAddress: null,
            userAgent: null,
            details: snapshot.details,
          }),
        );
      } finally {
        this.pending--;
      }
    } catch {
      /* Audit persistence must not affect project operations. */
    }
  }
}
