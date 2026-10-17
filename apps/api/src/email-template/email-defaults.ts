import { EmailTemplateType } from '@attraccess/database-entities';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { accessChangeTranslations } from './defaults/accounts-translations';
import { deleteAccountConfirmationTranslations } from './defaults/accounts-translations';
import { maintenanceRequestCreatedTranslations } from './defaults/resources-translations';
import { messageReceivedTranslations } from './defaults/resources-translations';
import { passwordChangedTranslations } from './defaults/accounts-translations';
import { projectInvitationTranslations } from './defaults/accounts-translations';
import { resetPasswordTranslations } from './defaults/accounts-translations';
import { resourceHealthChangedTranslations } from './defaults/resources-translations';
import { resourceSessionEndedTranslations } from './defaults/resources-translations';
import { resourceTakeoverTranslations } from './defaults/resources-translations';
import { resourceUsageBillingTransactionSummaryTranslations } from './defaults/resources-translations';
import { resourceUsageNoteAddedTranslations } from './defaults/resources-translations';
import { userInvitationTranslations } from './defaults/accounts-translations';
import { userRetrainingRequiredTranslations } from './defaults/resources-translations';
import { usernameChangedTranslations } from './defaults/accounts-translations';
import { verifyEmailTranslations } from './defaults/accounts-translations';

export const emailAccountDefaults = {
  [EmailTemplateType.VERIFY_EMAIL]: {
    subject: '{{t "subject" "Verify your email address"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.RESET_PASSWORD]: {
    subject: '{{t "subject" "Reset your password"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.USER_INVITATION]: {
    subject: '{{t "subject" "You have been invited to join Attraccess!"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.USERNAME_CHANGED]: {
    subject: '{{t "subject" "Your username has been changed"}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'user.previousUsername',
      'user.newUsername',
      'host.frontend',
      'host.backend',
      'url',
    ],
  },

  [EmailTemplateType.PASSWORD_CHANGED]: {
    subject: '{{t "subject" "Your password has been changed"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend'],
  },

  [EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION]: {
    subject: '{{t "subject" "Confirm account deletion"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.PROJECT_INVITATION]: {
    subject: '{{t "subject" "You have been invited to {project}" project=project.name}}',
    variables: [
      'user.username',
      'project.name',
      'inviter.username',
      'invitation.id',
      'invitation.role',
      'invitationUrl',
      'host.frontend',
    ],
  },
};

export const emailResourceDefaults = {
  [EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY]: {
    subject: '{{t "subject" "Your usage receipt for {resource}" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'usage.startTime',
      'usage.endTime',
      'usage.roundedMinutes',
      'usage.billingFactor',
      'items[].name',
      'items[].description',
      'items[].quantity',
      'items[].isUnavailable',
      'items[].unitPrice',
      'items[].total',
      'items[].isFixedFee',
      'items[].isSessionDuration',
      'items[].isOperatingDuration',
      'items[].isBillingFactor',
      'items[].isDuration',
      'items[].durationMs',
      'items[].hasDuration',
      'items[].durationSeconds',
      'totalCredits',
      'newBalance',
    ],
  },

  [EmailTemplateType.RESOURCE_HEALTH_CHANGED]: {
    subject:
      '{{#if health.isDegraded}}{{t "subject_degraded" "Resource degraded: {resource}" resource=resource.name}}{{else}}{{t "subject_recovered" "Resource recovered: {resource}" resource=resource.name}}{{/if}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'health.status',
      'health.previousStatus',
      'health.reason',
      'health.identifier',
      'health.isDegraded',
      'health.headerColor',
    ],
  },

  [EmailTemplateType.USER_RETRAINING_REQUIRED]: {
    subject: '{{t "subject" "Retraining required: {resource}" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'retraining.isAge',
      'retraining.isInactivity',
      'retraining.blocksAccess',
    ],
  },

  [EmailTemplateType.MESSAGE_RECEIVED]: {
    subject: '{{t "subject" "New message from {sender}" sender=message.senderName}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'message.senderName',
      'message.preview',
      'message.conversationUrl',
    ],
  },

  [EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED]: {
    subject: '{{t "subject" "New usage note: {resource}" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'note.authorName',
      'note.content',
      'note.isStart',
    ],
  },

  [EmailTemplateType.RESOURCE_TAKEOVER]: {
    subject: '{{t "subject" "{resource} was taken over" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'takeover.actorName',
    ],
  },

  [EmailTemplateType.RESOURCE_SESSION_ENDED]: {
    subject: '{{t "subject" "{resource} session ended" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'session.id',
      'session.endedAt',
      'session.endedBy',
    ],
  },

  [EmailTemplateType.ACCESS_CHANGE]: {
    subject: '{{accessChange.title}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'accessChange.title',
      'accessChange.body',
      'accessChange.url',
    ],
  },

  [EmailTemplateType.MAINTENANCE_REQUEST_CREATED]: {
    subject: '{{t "subject" "Maintenance requested: {resource}" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'request.id',
      'request.reason',
      'request.requestedBy',
    ],
  },
};

export interface EmailTemplateDefault {
  subject: string;
  variables: string[];
}

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateType, EmailTemplateDefault> = {
  ...emailAccountDefaults,
  ...emailResourceDefaults,
};

export interface ShippedTranslation {
  templateType: EmailTemplateType;
  locale: string;
  key: string;
  value: string;
}

// ponytail: seed migration 1782600000000 references this constant — adding rows here only affects fresh installs.
// Existing installs receive new rows only when an admin resets a template, or via a new migration.
export const SHIPPED_TRANSLATIONS: ShippedTranslation[] = [
  ...verifyEmailTranslations,
  ...resetPasswordTranslations,
  ...userInvitationTranslations,
  ...passwordChangedTranslations,
  ...usernameChangedTranslations,
  ...deleteAccountConfirmationTranslations,
  ...projectInvitationTranslations,
  ...resourceHealthChangedTranslations,
  ...userRetrainingRequiredTranslations,
  ...maintenanceRequestCreatedTranslations,
  ...resourceUsageNoteAddedTranslations,
  ...resourceUsageBillingTransactionSummaryTranslations,
  ...messageReceivedTranslations,
  ...accessChangeTranslations,
  ...resourceTakeoverTranslations,
  ...resourceSessionEndedTranslations,
];

// In the webpack bundle __dirname is the dist root (assets copied next to main.js);
// under jest the source layout applies and assets live one level up from this module.
const ASSETS_DIR =
  [join(__dirname, 'assets', 'email-defaults'), join(__dirname, '..', 'assets', 'email-defaults')].find(existsSync) ??
  join(__dirname, 'assets', 'email-defaults');

export function readDefaultTemplateBody(type: EmailTemplateType): string {
  return readFileSync(join(ASSETS_DIR, 'templates', `${type}.mjml`), 'utf-8').trim();
}

export function readDefaultLayoutBody(): string {
  return readFileSync(join(ASSETS_DIR, 'layout.mjml'), 'utf-8').trim();
}
