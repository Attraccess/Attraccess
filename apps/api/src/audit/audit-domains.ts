import { ADMINISTRATION_AUDIT_ACTIONS } from './audit-administration-policy';
import { ATTRACTAP_AUDIT_ACTIONS, IDENTITY_AUDIT_ACTIONS, RESOURCE_AUDIT_ACTIONS } from './audit-policy';

/**
 * Audit domains owned by the core application. Plugins contribute additional
 * domains through the plugin audit registry; nothing in the core may name a
 * plugin domain here.
 */
export const CORE_AUDIT_DOMAINS = [
  'administration',
  'attractap',
  'billing',
  'identity',
  'project',
  'resource',
  'sso',
] as const;
export type CoreAuditDomain = (typeof CORE_AUDIT_DOMAINS)[number];

/** Subject types recorded by core domains. Plugin subject types come from the plugin audit registry. */
export const CORE_SUBJECT_TYPES = [
  'attractap.reader',
  'attractap.card',
  'setting',
  'email-template',
  'email-layout',
  'mqtt-server',
  'plugin-package',
  'plugin-registry',
  'plugin-policy',
  'billing.transaction',
  'project',
  'project.invitation',
  'project.member',
  'identity.password_policy',
  'identity.role',
  'identity.user',
  'resource',
  'resource_group',
  'sso.provider',
  'user',
] as const;

export const SSO_AUDIT_ACTIONS = [
  'sso.provider.created',
  'sso.provider.updated',
  'sso.provider.deleted',
  'sso.provisioning.sessions_revoked',
  'sso.provisioning.user_created',
  'sso.provisioning.user_deleted',
  'sso.provisioning.permissions_synced',
] as const;

export const PROJECT_AUDIT_ACTIONS = [
  'project.created',
  'project.updated',
  'project.deleted',
  'project.archived',
  'project.unarchived',
  'project.member.added',
  'project.member.removed',
  'project.invitation.sent',
  'project.invitation.accepted',
  'project.invitation.rejected',
  'project.invitation.revoked',
] as const;

export const BILLING_AUDIT_ACTIONS = ['billing.transaction.created', 'billing.transaction.updated'] as const;

export const ALL_CORE_AUDIT_ACTIONS: readonly string[] = [
  ...ATTRACTAP_AUDIT_ACTIONS,
  ...IDENTITY_AUDIT_ACTIONS,
  ...RESOURCE_AUDIT_ACTIONS,
  ...ADMINISTRATION_AUDIT_ACTIONS,
  ...PROJECT_AUDIT_ACTIONS,
  ...SSO_AUDIT_ACTIONS,
  ...BILLING_AUDIT_ACTIONS,
];

/** One dot-separated lowercase name segment, as accepted in domains, actions and subject types. */
export const AUDIT_NAME_SEGMENT = '[a-z][a-z0-9_-]*';
export const AUDIT_DOMAIN_QUERY_PATTERN = /^[a-z][a-z_]{0,31}$/;
export const AUDIT_ACTION_QUERY_PATTERN = new RegExp(`^${AUDIT_NAME_SEGMENT}(?:\\.${AUDIT_NAME_SEGMENT})*$`);
export const AUDIT_SUBJECT_TYPE_QUERY_PATTERN = AUDIT_ACTION_QUERY_PATTERN;
export const AUDIT_EVENT_PREFIX_QUERY_PATTERN = new RegExp(`^${AUDIT_NAME_SEGMENT}(?:\\.${AUDIT_NAME_SEGMENT})*\\.?$`);
