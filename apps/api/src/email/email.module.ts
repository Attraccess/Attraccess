import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplateModule } from '../email-template/email-template.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    EmailTemplateModule,
    SettingsModule,
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
