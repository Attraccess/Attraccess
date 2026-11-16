import type { EmailTemplateRecord, EmailTemplateTranslationRecord } from '@attraccess/application-models';
import type { EmailTemplateStore } from './email-template-store.port';

/** In-memory EmailTemplateStore with call recording, for unit tests of code that only needs the port. */
export class FakeEmailTemplateStore implements EmailTemplateStore {
  templates = new Map<string, EmailTemplateRecord>();
  translations: EmailTemplateTranslationRecord[] = [];
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  put(type: string, patch: Partial<EmailTemplateRecord> = {}): EmailTemplateRecord {
    const row = {
      type,
      subject: 'Subject',
      body: '<mj-text>Body</mj-text>',
      variables: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...patch,
    } as EmailTemplateRecord;
    this.templates.set(type, row);
    return row;
  }

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  callsOf(method: string) {
    return this.calls.filter((call) => call.method === method);
  }

  async listTemplates() {
    return [...this.templates.values()];
  }

  async findTemplate(type: string) {
    return this.templates.get(type) ?? null;
  }

  async updateContent(type: string, content: { subject?: string; body?: string }) {
    this.record('updateContent', type, content);
    const row = this.templates.get(type);
    if (row) this.templates.set(type, { ...row, ...JSON.parse(JSON.stringify(content)) });
  }

  async restoreDefaults(
    type: string,
    defaults: { subject: string; body: string; variables: string[] },
    translations: EmailTemplateTranslationRecord[],
  ) {
    this.record('restoreDefaults', type, defaults, translations);
    const row = this.templates.get(type);
    if (row) this.templates.set(type, { ...row, ...defaults });
    this.translations = [...this.translations.filter((t) => t.templateType !== type), ...translations];
  }

  async registerPluginTemplate(
    template: { type: string; subject: string; body: string; variables: string[] },
    translations: EmailTemplateTranslationRecord[],
  ) {
    this.record('registerPluginTemplate', template, translations);
    if (!this.templates.has(template.type)) {
      this.put(template.type, template as Partial<EmailTemplateRecord>);
      this.translations.push(...translations);
    }
  }

  async findTranslations(type: string, locale?: string) {
    this.record('findTranslations', type, locale);
    return this.translations.filter((t) => t.templateType === type && (locale === undefined || t.locale === locale));
  }

  async replaceTranslations(
    type: string,
    locale: string,
    entries: Array<{ key: string; value: string }>,
    alsoInTransaction?: (context: object) => Promise<void>,
  ) {
    this.record('replaceTranslations', type, locale, entries);
    this.translations = this.translations.filter((t) => !(t.templateType === type && t.locale === locale));
    for (const { key, value } of entries) {
      this.translations.push({ templateType: type as never, locale, key, value });
    }
    await alsoInTransaction?.({ fake: 'transaction' });
  }

  async deleteTranslations(type: string, locale: string) {
    this.record('deleteTranslations', type, locale);
    this.translations = this.translations.filter((t) => !(t.templateType === type && t.locale === locale));
  }
}
