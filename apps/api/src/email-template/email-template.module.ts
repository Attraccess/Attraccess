import { Module } from '@nestjs/common';
import { EmailPersistenceModule } from '../database/adapters/email/email-persistence.module';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateController } from './email-template.controller';
import { MjmlModule } from './mjml.module';

@Module({
  imports: [EmailPersistenceModule, MjmlModule],
  providers: [EmailTemplateService],
  controllers: [EmailTemplateController],
  exports: [EmailTemplateService],
})
export class EmailTemplateModule {}
