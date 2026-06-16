import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateTranslation } from '@attraccess/database-entities';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateController } from './email-template.controller';
import { MjmlService } from './mjml.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate, EmailTemplateTranslation])],
  providers: [EmailTemplateService, MjmlService],
  controllers: [EmailTemplateController],
  exports: [EmailTemplateService, MjmlService],
})
export class EmailTemplateModule {}
