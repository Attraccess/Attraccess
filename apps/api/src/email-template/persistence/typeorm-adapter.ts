import { EmailTemplate, EmailTemplateTranslation, EmailTemplateType } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { toApplicationRecord } from '../../database/sqlite/backend';
import { EmailTemplatePersistence, EmailTemplateReader, TemplateChanges, TemplateTranslation } from './port';
@Injectable()
export class TypeormEmailTemplatePersistence extends EmailTemplatePersistence {
  constructor(
    @InjectRepository(EmailTemplate) private readonly rows: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateTranslation) private readonly translationRows: Repository<EmailTemplateTranslation>,
  ) {
    super();
  }
  async template(type: EmailTemplateType): Promise<EmailTemplate | null> {
    return toApplicationRecord(await this.rows.findOneBy({ type }));
  }
  async templates(): Promise<EmailTemplate[]> {
    return toApplicationRecord(await this.rows.find());
  }
  async update(type: EmailTemplateType, changes: TemplateChanges): Promise<void> {
    await this.rows.update({ type }, changes);
  }
  async translations(type: EmailTemplateType, locale?: string): Promise<EmailTemplateTranslation[]> {
    return toApplicationRecord(
      await this.translationRows.findBy({ templateType: type, ...(locale === undefined ? {} : { locale }) }),
    );
  }
  async replaceTranslations(
    type: EmailTemplateType,
    rows: readonly TemplateTranslation[],
    locale?: string,
  ): Promise<void> {
    // Construct outside the transaction as before; the entire delete/insert phase is atomic.
    const entities = rows.map((row) => this.translationRows.create(row));
    await this.translationRows.manager.transaction(async (manager) => {
      await manager.delete(EmailTemplateTranslation, {
        templateType: type,
        ...(locale === undefined ? {} : { locale }),
      });
      if (entities.length) await manager.insert(EmailTemplateTranslation, entities);
    });
  }
  async removeTranslations(type: EmailTemplateType, locale: string): Promise<void> {
    await this.translationRows.delete({ templateType: type, locale });
  }
}
export function emailTemplateTransactionOperations(manager: EntityManager): EmailTemplateReader {
  return new TypeormEmailTemplatePersistence(
    manager.getRepository(EmailTemplate),
    manager.getRepository(EmailTemplateTranslation),
  );
}
