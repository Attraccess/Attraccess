import { EmailRecipientPersistence } from './persistence/port';
import { TypeormEmailRecipientPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplateModule } from '../email-template/email-template.module';
import { EmailLayoutModule } from '../email-layout/email-layout.module';
import { SettingsModule } from '../settings/settings.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';

@Module({
  imports: [EmailTemplateModule, EmailLayoutModule, SettingsModule, TypeOrmModule.forFeature([User])],
  providers: [EmailService, { provide: EmailRecipientPersistence, useClass: TypeormEmailRecipientPersistence }],
  exports: [EmailService],
})
export class EmailModule {}
