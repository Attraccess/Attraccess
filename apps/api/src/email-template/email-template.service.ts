import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateTranslation, EmailTemplateType } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { MjmlService } from './mjml.service';
import { EMAIL_TEMPLATE_DEFAULTS, readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from './email-defaults';
import { extractTranslationKeys, TranslationKey } from '@attraccess/shared';

export interface TemplateTranslations {
  keys: TranslationKey[];
  translations: Record<string, Record<string, string>>;
}

@Injectable()
export class EmailTemplateService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateTranslation)
    private readonly translationRepository: Repository<EmailTemplateTranslation>,
    private readonly mjmlService: MjmlService,
  ) {}

  async findAll(): Promise<EmailTemplate[]> {
    return this.emailTemplateRepository.find();
  }

  async findOne(type: EmailTemplateType, manager?: EntityManager): Promise<EmailTemplate> {
    const repo = manager ? manager.getRepository(EmailTemplate) : this.emailTemplateRepository;
    const template = await repo.findOneBy({ type });
    if (!template) {
      throw new NotFoundException(`Email template "${type}" not found`);
    }
    return template;
  }

  async update(type: EmailTemplateType, updateEmailTemplateDto: UpdateEmailTemplateDto): Promise<EmailTemplate> {
    await this.findOne(type);

    if (updateEmailTemplateDto.body) {
      await this.mjmlService.validateAndConvert(updateEmailTemplateDto.body);
    }

    await this.emailTemplateRepository.update({ type }, {
      body: updateEmailTemplateDto.body,
      subject: updateEmailTemplateDto.subject,
    });

    return this.findOne(type);
  }

  async resetToDefault(type: EmailTemplateType): Promise<EmailTemplate> {
    await this.findOne(type);

    const defaults = EMAIL_TEMPLATE_DEFAULTS[type];
    const body = readDefaultTemplateBody(type);

    await this.emailTemplateRepository.update(
      { type },
      { subject: defaults.subject, body, variables: defaults.variables },
    );

    await this.translationRepository.manager.transaction(async (manager) => {
      await manager.delete(EmailTemplateTranslation, { templateType: type });
      const shipped = SHIPPED_TRANSLATIONS.filter((t) => t.templateType === type);
      if (shipped.length > 0) {
        await manager.insert(
          EmailTemplateTranslation,
          shipped.map((t) => manager.create(EmailTemplateTranslation, { templateType: t.templateType, locale: t.locale, key: t.key, value: t.value })),
        );
      }
    });

    return this.findOne(type);
  }

  async getTranslationsMap(type: EmailTemplateType, locale: string): Promise<Record<string, string>> {
    const baseLocale = locale.split('-')[0];
    const hasRegion = baseLocale !== locale;

    if (!hasRegion) {
      const rows = await this.translationRepository.findBy({ templateType: type, locale });
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    }

    // BCP-47 merge: base translations first, then regional overrides per key.
    // Skip empty regional values so they fall through to the base translation.
    const [baseRows, regionalRows] = await Promise.all([
      this.translationRepository.findBy({ templateType: type, locale: baseLocale }),
      this.translationRepository.findBy({ templateType: type, locale }),
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
    const rows = await this.translationRepository.findBy({ templateType: type });

    const translations: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!translations[row.locale]) translations[row.locale] = {};
      translations[row.locale][row.key] = row.value;
    }

    return { keys, translations };
  }

  async setTranslations(type: EmailTemplateType, locale: string, data: Record<string, string>): Promise<void> {
    await this.findOne(type);
    const entities = Object.entries(data).map(([key, value]) =>
      this.translationRepository.create({ templateType: type, key, locale, value }),
    );
    await this.translationRepository.manager.transaction(async (manager) => {
      await manager.delete(EmailTemplateTranslation, { templateType: type, locale });
      if (entities.length > 0) {
        await manager.insert(EmailTemplateTranslation, entities);
      }
    });
  }

  async deleteTranslations(type: EmailTemplateType, locale: string): Promise<void> {
    await this.findOne(type);
    await this.translationRepository.delete({ templateType: type, locale });
  }
}
