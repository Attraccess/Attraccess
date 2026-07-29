import { Module } from '@nestjs/common';
import { MjmlService } from './mjml.service';

@Module({
  providers: [MjmlService],
  exports: [MjmlService],
})
export class MjmlModule {}
