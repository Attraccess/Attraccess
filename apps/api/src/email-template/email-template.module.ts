import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate } from '@attraccess/database-entities';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateController } from './email-template.controller';
import { MjmlModule } from './mjml.module';
import { EmailLayoutModule } from '../email-layout/email-layout.module';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate]), MjmlModule, forwardRef(() => EmailLayoutModule)],
  providers: [EmailTemplateService],
  controllers: [EmailTemplateController],
  exports: [EmailTemplateService],
})
export class EmailTemplateModule {}
