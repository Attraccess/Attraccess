import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionScope } from '../database/transaction-scope';
import { EMAIL_TEMPLATE_READ, EmailTemplatePersistence } from './persistence/port';
import { EmailTemplate, EmailTemplateType } from '@attraccess/application-models';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { MjmlService } from './mjml.service';
import { EMAIL_TEMPLATE_DEFAULTS, readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from './email-defaults';
import { extractTranslationKeys, isFullMjmlDocument, TranslationKey } from '@attraccess/shared';

export interface TemplateTranslations {
  keys: TranslationKey[];
  translations: Record<string, Record<string, string>>;
}

@Injectable()
export class EmailTemplateService {
  constructor(
    private readonly persistence: EmailTemplatePersistence,
    private readonly mjmlService: MjmlService,
  ) {}

  async findAll(): Promise<EmailTemplate[]> {
    return this.persistence.templates();
  }

  async findOne(type: EmailTemplateType, scope?: TransactionScope): Promise<EmailTemplate> {
    const reader = scope ? scope.resolve(EMAIL_TEMPLATE_READ) : this.persistence;
    const template = await reader.template(type);
    if (!template) {
      throw new NotFoundException(`Email template "${type}" not found`);
    }
    return template;
  }

  async update(type: EmailTemplateType, updateEmailTemplateDto: UpdateEmailTemplateDto): Promise<EmailTemplate> {
    await this.findOne(type);

    if (updateEmailTemplateDto.body) {
      // Bodies are MJML fragments injected into the global layout at send time;
      // a full <mjml> document would nest invalidly when the email is rendered.
      if (isFullMjmlDocument(updateEmailTemplateDto.body)) {
        throw new BadRequestException('Template body must be an MJML fragment without an <mjml> root element');
      }
      await this.mjmlService.validateAndConvert(`<mjml><mj-body>${updateEmailTemplateDto.body}</mj-body></mjml>`);
    }

    await this.persistence.update(type, {
      body: updateEmailTemplateDto.body,
      subject: updateEmailTemplateDto.subject,
    });

    return this.findOne(type);
  }

  async resetToDefault(type: EmailTemplateType): Promise<EmailTemplate> {
    await this.findOne(type);

    const defaults = EMAIL_TEMPLATE_DEFAULTS[type];
    const body = readDefaultTemplateBody(type);

    await this.persistence.update(type, { subject: defaults.subject, body, variables: defaults.variables });

    await this.persistence.replaceTranslations(
      type,
      SHIPPED_TRANSLATIONS.filter((row) => row.templateType === type),
    );

    return this.findOne(type);
  }

  async getExactTranslationsMap(type: EmailTemplateType, locale: string): Promise<Record<string, string>> {
    const rows = await this.persistence.translations(type, locale);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async getTranslationsMap(type: EmailTemplateType, locale: string): Promise<Record<string, string>> {
    const baseLocale = locale.split('-')[0];
    const hasRegion = baseLocale !== locale;

    if (!hasRegion) {
      return this.getExactTranslationsMap(type, locale);
    }

    // BCP-47 merge: base translations first, then regional overrides per key.
    // Skip empty regional values so they fall through to the base translation.
    const [baseRows, regionalRows] = await Promise.all([
      this.persistence.translations(type, baseLocale),
      this.persistence.translations(type, locale),
    ]);
    const base = Object.fromEntries(baseRows.map((r) => [r.key, r.value]));
    for (const r of regionalRows) {
      if (r.value !== '') base[r.key] = r.value;
    }
    return base;
  }

  async getTranslations(type: EmailTemplateType): Promise<TemplateTranslations> {
    const template = await this.findOne(type);
    const keys = extractTranslationKeys(template.subject + '\n' + template.body);
    const rows = await this.persistence.translations(type);

    const translations: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!translations[row.locale]) translations[row.locale] = {};
      translations[row.locale][row.key] = row.value;
    }

    return { keys, translations };
  }

  async setTranslations(type: EmailTemplateType, locale: string, data: Record<string, string>): Promise<void> {
    await this.findOne(type);
    const rows = Object.entries(data).map(([key, value]) => ({ templateType: type, key, locale, value }));
    await this.persistence.replaceTranslations(type, rows, locale);
  }

  async deleteTranslations(type: EmailTemplateType, locale: string): Promise<void> {
    await this.findOne(type);
    await this.persistence.removeTranslations(type, locale);
  }
}
