import { SqliteTransactionDriver } from '../database/sqlite/transactions';
import { EMAIL_TEMPLATE_READ, EmailTemplatePersistence } from './persistence/port';
import { TypeormEmailTemplatePersistence, emailTemplateTransactionOperations } from './persistence/typeorm-adapter';
import { Repository } from 'typeorm';
import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateTranslation } from '@attraccess/database-entities';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateController } from './email-template.controller';
import { MjmlModule } from './mjml.module';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate, EmailTemplateTranslation]), MjmlModule],
  providers: [
    EmailTemplateService,
    {
      provide: EmailTemplatePersistence,
      useFactory: (
        driver: SqliteTransactionDriver,
        templates: Repository<EmailTemplate>,
        translations: Repository<EmailTemplateTranslation>,
      ) => {
        driver.register(EMAIL_TEMPLATE_READ, emailTemplateTransactionOperations);
        return new TypeormEmailTemplatePersistence(templates, translations);
      },
      inject: [
        SqliteTransactionDriver,
        getRepositoryToken(EmailTemplate),
        getRepositoryToken(EmailTemplateTranslation),
      ],
    },
  ],
  controllers: [EmailTemplateController],
  exports: [EmailTemplateService],
})
export class EmailTemplateModule {}
