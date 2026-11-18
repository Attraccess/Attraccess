import { Module } from '@nestjs/common';
import { PushPersistenceModule } from '../database/adapters/push/push-persistence.module';
import { SettingsModule } from '../settings/settings.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [PushPersistenceModule, SettingsModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
