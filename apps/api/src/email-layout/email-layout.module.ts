import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailLayout } from '@attraccess/database-entities';
import { EmailLayoutService } from './email-layout.service';
import { EmailLayoutController } from './email-layout.controller';
import { MjmlModule } from '../email-template/mjml.module';

@Module({
  imports: [TypeOrmModule.forFeature([EmailLayout]), MjmlModule],
  providers: [EmailLayoutService],
  controllers: [EmailLayoutController],
  exports: [EmailLayoutService],
})
export class EmailLayoutModule {}
