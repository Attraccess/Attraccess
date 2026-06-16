import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateTranslation, EmailTemplateType } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { MjmlService } from './mjml.service';

export interface TranslationKey {
  key: string;
  defaultValue: string;
}

export interface TemplateTranslations {
  keys: TranslationKey[];
  translations: Record<string, Record<string, string>>;
}

function extractTranslationKeys(content: string): TranslationKey[] {
  const regex = /\{\{t\s+["']([^"']+)["']\s+["']([^"']*)["']/g;
  const seen = new Set<string>();
  const keys: TranslationKey[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      keys.push({ key: match[1], defaultValue: match[2] });
    }
  }
  return keys;
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

  async getTranslationsMap(type: EmailTemplateType, locale: string): Promise<Record<string, string>> {
    const rows = await this.translationRepository.findBy({ templateType: type, locale });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
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
    await this.translationRepository.delete({ templateType: type, locale });
    const entities = Object.entries(data).map(([key, value]) =>
      this.translationRepository.create({ templateType: type, key, locale, value }),
    );
    if (entities.length > 0) {
      await this.translationRepository.insert(entities);
    }
  }

  async deleteTranslations(type: EmailTemplateType, locale: string): Promise<void> {
    await this.translationRepository.delete({ templateType: type, locale });
  }
}
