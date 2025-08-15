import { Module } from '@nestjs/common';
import { LicenseService } from './license.service';
import { ConfigModule } from '@nestjs/config';
import { LicenseController } from './license.controller';

@Module({
  imports: [ConfigModule],
  controllers: [LicenseController],
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
