import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateTranslation } from '@attraccess/database-entities';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateController } from './email-template.controller';
import { MjmlModule } from './mjml.module';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate, EmailTemplateTranslation]), MjmlModule],
  providers: [EmailTemplateService],
  controllers: [EmailTemplateController],
  exports: [EmailTemplateService],
})
export class EmailTemplateModule {}
