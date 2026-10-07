import { randomUUID } from 'node:crypto';
import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';

const fixturePluginId = 'abcdefghijklmnopqrstu';

/** Neutral stand-in for a plugin-contributed audit domain; the host never names a real plugin. */
const demoDomain: PluginAuditDomainDeclaration = {
  domain: 'demo',
  labels: { en: 'Demo devices' },
  actions: [
    { action: 'demo.claim', subjectTypes: ['demo.device'] },
    {
      action: 'demo.publication',
      subjectTypes: ['demo.device'],
      details: { revision: { type: 'number', integer: true, min: 1 } },
    },
    {
      action: 'demo.rollback',
      subjectTypes: ['demo.device'],
      details: {
        sourceRevision: { type: 'number', integer: true, min: 1 },
        revision: { type: 'number', integer: true, min: 1 },
      },
    },
    {
      action: 'demo.manual_command',
      subjectTypes: ['demo.device'],
      details: {
        channelId: { type: 'string', pattern: '[a-zA-Z0-9_-]{1,64}' },
        commandId: {
          type: 'string',
          pattern: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
        },
        operation: { type: 'string', oneOf: ['set', 'pulse'] },
        result: { type: 'string', oneOf: ['dispatched', 'acknowledged', 'rejected', 'timeout', 'transport_failure'] },
      },
    },
    {
      action: 'demo.profile_change',
      subjectTypes: ['demo.device'],
      details: {
        profileId: { type: 'string', maxLength: 160, pattern: '(?=[\\s\\S]*\\S)[\\s\\S]*' },
        profileVersion: { type: 'number', integer: true, min: 1, max: 1_000_000 },
        'before.physicalPointCount': { type: 'number', integer: true, min: 0 },
        'before.logicalChannelCount': { type: 'number', integer: true, min: 0 },
        'after.physicalPointCount': { type: 'number', integer: true, min: 0 },
        'after.logicalChannelCount': { type: 'number', integer: true, min: 0 },
      },
    },
    { action: 'demo.commissioning.install', subjectTypes: ['demo.commissioning'] },
    { action: 'demo.commissioning.recover', subjectTypes: ['demo.commissioning'] },
  ],
};

const event = (): PluginAuditEvent & { pluginId: string } => ({
  pluginId: fixturePluginId,
  action: 'demo.publication',
  operationId: randomUUID(),
  principal: { userId: 42, authenticationMethod: 'session' },
  outcome: 'succeeded',
  subject: { type: 'demo.device', id: 7 },
  details: { revision: 2 },
});

const config = {
  enabled: true,
  domains: ['administration', 'attractap', 'identity', 'project', 'resource', 'sso'],
  plugin_domains_disabled: [],
  retention_days: 90,
};
export function registerAuditAuthorizationAndQueryValidationFixture() {
  return {
    get fixturePluginId() {
      return fixturePluginId;
    },
    get demoDomain() {
      return demoDomain;
    },
    get event() {
      return event;
    },
    get config() {
      return config;
    },
  };
}
