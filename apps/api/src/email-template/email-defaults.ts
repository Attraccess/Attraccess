import { EmailTemplateType } from '@attraccess/database-entities';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { accessChangeTranslations } from './email-access-change-translations';
import { emailAccountDefaults } from './email-account-defaults';
import { deleteAccountConfirmationTranslations } from './email-delete-account-confirmation-translations';
import { maintenanceRequestCreatedTranslations } from './email-maintenance-request-created-translations';
import { messageReceivedTranslations } from './email-message-received-translations';
import { passwordChangedTranslations } from './email-password-changed-translations';
import { projectInvitationTranslations } from './email-project-invitation-translations';
import { resetPasswordTranslations } from './email-reset-password-translations';
import { emailResourceDefaults } from './email-resource-defaults';
import { resourceHealthChangedTranslations } from './email-resource-health-changed-translations';
import { resourceSessionEndedTranslations } from './email-resource-session-ended-translations';
import { resourceTakeoverTranslations } from './email-resource-takeover-translations';
import { resourceUsageBillingTransactionSummaryTranslations } from './email-resource-usage-billing-transaction-summary-translations';
import { resourceUsageNoteAddedTranslations } from './email-resource-usage-note-added-translations';
import { userInvitationTranslations } from './email-user-invitation-translations';
import { userRetrainingRequiredTranslations } from './email-user-retraining-required-translations';
import { usernameChangedTranslations } from './email-username-changed-translations';
import { verifyEmailTranslations } from './email-verify-email-translations';

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
