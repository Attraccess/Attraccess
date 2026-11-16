import { billingTransactionAuditEvent } from './policies/billing';
import { AuditLog, SSOProviderType } from '@attraccess/database-entities';
import { randomUUID } from 'node:crypto';
import { ssoAuditSnapshot } from '../users-and-auth/auth/sso/audit/provider-audit';
import { AuditService } from './audit.service';
import { PluginAuditHost } from './plugin-audit-host';
export interface DomainScenario {
  domain: string;
  action: string;
  subjectType: string;
  subjectId: number;
  emit: (audit: AuditService) => Promise<unknown>;
}
export // The plugin-contributed domain stands in for any installed plugin: the host
// enables it through the registry plus the plugin blocklist, never a core enum.
const fixturePluginId = 'abcdefghijklmnopqrstu';
export const pluginDomain = 'demo';
export // These examples exercise the public event projections, migrated storage, HTTP query
// validation, authentication and settings together. Domain service tests additionally
// verify that the corresponding business operations emit the events.
const scenarios: DomainScenario[] = [
  {
    domain: 'resource',
    action: 'maintenance_schedule.updated',
    subjectType: 'resource',
    subjectId: 101,
    emit: (audit) =>
      audit.record({
        domain: 'resource',
        action: 'maintenance_schedule.updated',
        actor: { id: 42, authenticationMethod: 'api-token', apiTokenId: 19 },
        subject: { type: 'resource', id: 101 },
        details: { scheduleId: 12, enabled: 1, triggerType: 'USAGE_COUNT', usageThreshold: 40 },
      }),
  },
  {
    domain: pluginDomain,
    action: 'demo.publication',
    subjectType: 'demo.device',
    subjectId: 102,
    // Plugins record through the SDK's host provider, which maps the event onto the envelope.
    emit: (audit) =>
      new PluginAuditHost(audit).record({
        pluginId: fixturePluginId,
        action: 'demo.publication',
        operationId: randomUUID(),
        principal: { userId: 42, authenticationMethod: 'session' },
        outcome: 'succeeded',
        subject: { type: 'demo.device', id: 102 },
        details: { revision: 2 },
      }),
  },
  {
    domain: 'billing',
    action: 'billing.transaction.created',
    subjectType: 'billing.transaction',
    subjectId: 103,
    emit: (audit) =>
      audit.record(
        billingTransactionAuditEvent({
          transactionId: 103,
          userId: 42,
          initiatorId: 42,
          amount: 125,
          status: 'completed',
          source: 'manual',
        }),
      ),
  },
  {
    domain: 'administration',
    action: 'mqtt_server.created',
    subjectType: 'mqtt-server',
    subjectId: 104,
    emit: (audit) =>
      audit.record({
        domain: 'administration',
        action: 'mqtt_server.created',
        actor: { id: 42, authenticationMethod: 'session' },
        subject: { type: 'mqtt-server', id: 104 },
        details: { serverName: 'Workshop broker', host: 'mqtt.example.test', port: 1883, useTls: 0 },
      }),
  },
  {
    domain: 'identity',
    action: 'identity.user_updated',
    subjectType: 'identity.user',
    subjectId: 105,
    emit: (audit) =>
      audit.record({
        domain: 'identity',
        action: 'identity.user_updated',
        operationId: randomUUID(),
        actor: { id: 42, authenticationMethod: 'session' },
        subject: { type: 'identity.user', id: 105 },
        outcome: 'succeeded',
        request: { ipAddress: '2001:db8::1', userAgent: 'Audit verification' },
        details: { field: 'username' },
      }),
  },
  {
    domain: 'project',
    action: 'project.created',
    subjectType: 'project',
    subjectId: 106,
    emit: (audit) =>
      audit.record({
        domain: 'project',
        action: 'project.created',
        actor: { id: 42, authenticationMethod: 'session' },
        subject: { type: 'project', id: 106 },
        details: { projectId: 106, 'after.name': 'Workshop project', 'after.hasLogo': 0 },
      }),
  },
  {
    domain: 'attractap',
    action: 'attractap.reader.deregistered',
    subjectType: 'attractap.reader',
    subjectId: 107,
    emit: (audit) =>
      audit.record({
        domain: 'attractap',
        action: 'attractap.reader.deregistered',
        actor: { id: 42, authenticationMethod: 'session' },
        subject: { type: 'attractap.reader', id: 107 },
        details: { source: 'admin-api' },
      }),
  },
  {
    domain: 'sso',
    action: 'sso.provider.created',
    subjectType: 'sso.provider',
    subjectId: 108,
    emit: (audit) =>
      audit.record({
        domain: 'sso',
        action: 'sso.provider.created',
        operationId: randomUUID(),
        actor: { id: 42, authenticationMethod: 'session' },
        subject: { type: 'sso.provider', id: 108 },
        details: {
          before: 'null',
          after: ssoAuditSnapshot({
            id: 108,
            name: 'Workshop identity provider',
            type: SSOProviderType.OIDC,
            oidcConfiguration: {
              issuer: 'https://idp.example.test',
              authorizationURL: 'https://idp.example.test/authorize',
              tokenURL: 'https://idp.example.test/token',
              userInfoURL: 'https://idp.example.test/userinfo',
              clientId: 'workshop',
              clientSecret: 'never-record-this-secret',
              scopes: ['email'],
              roleMappings: null,
            },
          } as never),
        },
      }),
  },
];
export const domains = scenarios.map(({ domain }) => domain);
export const scenarioActions = new Set(scenarios.map(({ action }) => action));
export const scenarioEntries = (items: AuditLog[]) => items.filter(({ action }) => scenarioActions.has(action));
