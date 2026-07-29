import { Module } from '@nestjs/common';
import { EmailLayoutService } from './email-layout.service';
import { EmailLayoutController } from './email-layout.controller';
import { MjmlModule } from '../email-template/mjml.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [MjmlModule, SettingsModule],
  providers: [EmailLayoutService],
  controllers: [EmailLayoutController],
  exports: [EmailLayoutService],
})
export class EmailLayoutModule {}
