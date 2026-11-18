import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { PluginEmailService } from './plugin-email.service';
import { EmailTemplateModule } from '../email-template/email-template.module';
import { EmailLayoutModule } from '../email-layout/email-layout.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailPersistenceModule } from '../database/adapters/email/email-persistence.module';

@Module({
  imports: [EmailTemplateModule, EmailLayoutModule, SettingsModule, EmailPersistenceModule],
  providers: [EmailService, PluginEmailService],
  exports: [EmailService, PluginEmailService],
})
export class EmailModule {}
