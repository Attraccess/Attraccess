import type { EmailTemplateRecord, EmailTemplateTranslationRecord } from '@attraccess/application-models';

/** The transaction a read joins; a unit-of-work scope (an open object for callers that still pass a raw handle). */
export type EmailTemplateReadContext = object;

export interface EmailTemplateContent {
  subject?: string;
  body?: string;
}

/** The texts a template is restored to, with the translations that ship with them. */
export interface EmailTemplateDefaults {
  subject: string;
  body: string;
  variables: string[];
}

/** Persistence of email templates and their translations. Keys are core template types or plugin keys. */
export const EMAIL_TEMPLATE_STORE = Symbol.for('attraccess.email-template.store');

export interface EmailTemplateStore {
  listTemplates(): Promise<EmailTemplateRecord[]>;
  findTemplate(type: string, context?: EmailTemplateReadContext): Promise<EmailTemplateRecord | null>;
  updateContent(type: string, content: EmailTemplateContent): Promise<void>;
  /** Restores subject, body and variables, then replaces all translations of the template with the shipped ones. */
  restoreDefaults(
    type: string,
    defaults: EmailTemplateDefaults,
    translations: EmailTemplateTranslationRecord[],
  ): Promise<void>;
  /**
   * Stores a plugin template and its shipped translations in one transaction when it is not stored yet; an existing
   * template only gets its variable list updated. A concurrent seeding is a no-op instead of a conflict.
   */
  registerPluginTemplate(
    template: { type: string } & EmailTemplateDefaults,
    translations: EmailTemplateTranslationRecord[],
  ): Promise<void>;
  /** Translations of a template, of one locale when given. */
  findTranslations(type: string, locale?: string): Promise<EmailTemplateTranslationRecord[]>;
  /**
   * Replaces all translations of one locale atomically. `alsoInTransaction` runs inside the same transaction with its
   * context (audit rows commit with the translations).
   */
  replaceTranslations(
    type: string,
    locale: string,
    entries: Array<{ key: string; value: string }>,
    alsoInTransaction?: (context: EmailTemplateReadContext) => Promise<void>,
  ): Promise<void>;
  deleteTranslations(type: string, locale: string): Promise<void>;
}
