import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersistenceCoreModule } from '../common/persistence-core.module';
import { EmailTemplate, EmailTemplateTranslation, User } from '@attraccess/database-entities';
import { EMAIL_RECIPIENT_DIRECTORY } from '../../../email/email-recipient-directory.port';
import { EMAIL_TEMPLATE_STORE } from '../../../email-template/email-template-store.port';
import { TypeOrmEmailRecipientDirectory } from './typeorm-email-recipient-directory';
import { TypeOrmEmailTemplateStore } from './typeorm-email-template-store';

/** Persistence for the email area: templates, translations and the recipient lookup. */
@Module({
  imports: [PersistenceCoreModule, TypeOrmModule.forFeature([EmailTemplate, EmailTemplateTranslation, User])],
  providers: [
    { provide: EMAIL_TEMPLATE_STORE, useClass: TypeOrmEmailTemplateStore },
    { provide: EMAIL_RECIPIENT_DIRECTORY, useClass: TypeOrmEmailRecipientDirectory },
  ],
  exports: [EMAIL_TEMPLATE_STORE, EMAIL_RECIPIENT_DIRECTORY],
})
export class EmailPersistenceModule {}
