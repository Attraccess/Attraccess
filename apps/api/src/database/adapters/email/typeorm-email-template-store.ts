import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateTranslation } from '@attraccess/database-entities';
import { EmailTemplateRecord, EmailTemplateTranslationRecord, EmailTemplateType } from '@attraccess/application-models';
import { EntityManager, Repository } from 'typeorm';
import {
  EmailTemplateContent,
  EmailTemplateDefaults,
  EmailTemplateReadContext,
  EmailTemplateStore,
} from '../../../email-template/email-template-store.port';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';
import { TransactionHandles } from '../common/transaction-handles';

const asType = (type: string) => type as EmailTemplateType;

const toRecord = (row: EmailTemplate): EmailTemplateRecord => ({
  type: row.type,
  subject: row.subject,
  body: row.body,
  variables: row.variables,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toTranslationRecord = (row: EmailTemplateTranslation): EmailTemplateTranslationRecord => ({
  templateType: row.templateType,
  key: row.key,
  locale: row.locale,
  value: row.value,
});

@Injectable()
export class TypeOrmEmailTemplateStore implements EmailTemplateStore {
  constructor(
    @InjectRepository(EmailTemplate) private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateTranslation) private readonly translations: Repository<EmailTemplateTranslation>,
    private readonly handles: TransactionHandles,
  ) {}

  async listTemplates(): Promise<EmailTemplateRecord[]> {
    return (await this.templates.find()).map(toRecord);
  }

  async findTemplate(type: string, context?: EmailTemplateReadContext): Promise<EmailTemplateRecord | null> {
    const manager = this.handles.managerOf(context);
    const repository = manager ? manager.getRepository(EmailTemplate) : this.templates;
    const row = await repository.findOneBy({ type: asType(type) });
    return row ? toRecord(row) : null;
  }

  async updateContent(type: string, content: EmailTemplateContent): Promise<void> {
    await this.templates.update({ type: asType(type) }, { body: content.body, subject: content.subject });
  }

  async restoreDefaults(
    type: string,
    { subject, body, variables }: EmailTemplateDefaults,
    translations: EmailTemplateTranslationRecord[],
  ): Promise<void> {
    await this.templates.update({ type: asType(type) }, { subject, body, variables });
    await this.translations.manager.transaction(async (manager) => {
      await manager.delete(EmailTemplateTranslation, { templateType: asType(type) });
      if (translations.length > 0) {
        await manager.insert(
          EmailTemplateTranslation,
          translations.map((t) =>
            manager.create(EmailTemplateTranslation, {
              templateType: asType(type),
              locale: t.locale,
              key: t.key,
              value: t.value,
            }),
          ),
        );
      }
    });
  }

  async registerPluginTemplate(
    template: { type: string } & EmailTemplateDefaults,
    translations: EmailTemplateTranslationRecord[],
  ): Promise<void> {
    await this.templates.manager.transaction(async (manager) => {
      const templates = manager.getRepository(EmailTemplate);
      const type = asType(template.type);
      const existing = await templates.findOneBy({ type });
      if (existing) {
        if (existing.variables.join(',') !== template.variables.join(',')) {
          await templates.update({ type }, { variables: template.variables });
        }
        return;
      }
      // orIgnore: a second instance seeding at the same time is a no-op instead of a conflict.
      await templates
        .createQueryBuilder()
        .insert()
        .values({ type, subject: template.subject, body: template.body, variables: template.variables })
        .orIgnore()
        .execute();
      // Translations are seeded with the row only, so ones an admin deleted later stay deleted.
      if (translations.length > 0) {
        await manager
          .getRepository(EmailTemplateTranslation)
          .createQueryBuilder()
          .insert()
          .values(
            translations.map((t) => ({ templateType: t.templateType, locale: t.locale, key: t.key, value: t.value })),
          )
          .orIgnore()
          .execute();
      }
    });
  }

  async findTranslations(type: string, locale?: string): Promise<EmailTemplateTranslationRecord[]> {
    const rows = await this.translations.findBy(
      locale === undefined ? { templateType: asType(type) } : { templateType: asType(type), locale },
    );
    return rows.map(toTranslationRecord);
  }

  async replaceTranslations(
    type: string,
    locale: string,
    entries: Array<{ key: string; value: string }>,
    alsoInTransaction?: (context: EmailTemplateReadContext) => Promise<void>,
  ): Promise<void> {
    const rows = entries.map(({ key, value }) =>
      this.translations.create({ templateType: asType(type), key, locale, value }),
    );
    await this.translations.manager.transaction(async (manager: EntityManager) => {
      await manager.delete(EmailTemplateTranslation, { templateType: asType(type), locale });
      if (rows.length > 0) {
        await manager.insert(EmailTemplateTranslation, rows);
      }
      await alsoInTransaction?.(legacyEngineTransactionScope(manager));
    });
  }

  async deleteTranslations(type: string, locale: string): Promise<void> {
    await this.translations.delete({ templateType: asType(type), locale });
  }
}
