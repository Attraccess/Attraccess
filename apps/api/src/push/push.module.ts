import { PushPersistence } from './persistence/port';
import { TypeormPushPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from '@attraccess/database-entities';
import { SettingsModule } from '../settings/settings.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription]), SettingsModule],
  controllers: [PushController],
  providers: [PushService, { provide: PushPersistence, useClass: TypeormPushPersistence }],
  exports: [PushService],
})
export class PushModule {}
