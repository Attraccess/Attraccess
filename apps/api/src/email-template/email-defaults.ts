import { readFileSync } from 'fs';
import { join } from 'path';
import { EmailTemplateType } from '@attraccess/database-entities';

export interface EmailTemplateDefault {
  subject: string;
  variables: string[];
}

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateType, EmailTemplateDefault> = {
  [EmailTemplateType.VERIFY_EMAIL]: {
    subject: 'Verify your email address',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.RESET_PASSWORD]: {
    subject: 'Reset your password',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.USER_INVITATION]: {
    subject: 'You have been invited to join Attraccess!',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.USERNAME_CHANGED]: {
    subject: 'Your username has been changed',
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
    subject: 'Your password has been changed',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend'],
  },
  [EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION]: {
    subject: 'Confirm account deletion',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.PROJECT_INVITATION]: {
    subject: 'You have been invited to {{project.name}}',
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
  [EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY]: {
    subject: 'Your usage receipt for {{resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'host.frontend',
      'host.backend',
      'usage.startTime',
      'usage.endTime',
      'usage.roundedMinutes',
      'items[].name',
      'items[].quantity',
      'items[].unitPrice',
      'items[].total',
      'totalCredits',
      'newBalance',
    ],
  },
  [EmailTemplateType.RESOURCE_HEALTH_CHANGED]: {
    subject: '{{health.headline}}: {{resource.name}}',
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
      'health.headline',
      'health.headerColor',
      'health.bodyAction',
    ],
  },
  [EmailTemplateType.USER_RETRAINING_REQUIRED]: {
    subject: 'Retraining required: {{resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'retraining.reason',
      'retraining.blocksAccess',
    ],
  },
  [EmailTemplateType.MESSAGE_RECEIVED]: {
    subject: 'New message from {{message.senderName}}',
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
    subject: 'New usage note: {{resource.name}}',
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
      'note.phase',
      'note.phaseAction',
    ],
  },
  [EmailTemplateType.RESOURCE_TAKEOVER]: {
    subject: '{{resource.name}} was taken over',
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
    subject: '{{resource.name}} session ended',
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
    subject: 'Maintenance requested: {{resource.name}}',
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

const ASSETS_DIR = join(__dirname, 'assets', 'email-defaults');

export function readDefaultTemplateBody(type: EmailTemplateType): string {
  return readFileSync(join(ASSETS_DIR, 'templates', `${type}.mjml`), 'utf-8').trim();
}

export function readDefaultLayoutBody(): string {
  return readFileSync(join(ASSETS_DIR, 'layout.mjml'), 'utf-8').trim();
}
